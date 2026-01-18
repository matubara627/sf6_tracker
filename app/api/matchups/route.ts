import { NextResponse, NextRequest } from 'next/server';
import puppeteer from 'puppeteer';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userCode = searchParams.get('userCode');
    const targetCharName = searchParams.get('character'); 

    if (!userCode || !targetCharName) {
      return NextResponse.json({ error: "情報が不足しています" }, { status: 400 });
    }

    console.log(`🚀 個別データ取得開始: ${userCode} - ${targetCharName}`);

    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280,800',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ]
    });
    
    const page = await browser.newPage();
    
    // Cookieセット
    const cookieString = process.env.SF6_COOKIE;
    if (!cookieString) {
        await browser.close();
        return NextResponse.json({ error: "Cookie設定なし" }, { status: 500 });
    }
    const cookies = cookieString.split(';').map((c) => {
      const parts = c.trim().split('=');
      return { name: parts[0], value: parts.slice(1).join('='), domain: '.streetfighter.com' };
    });
    await page.setCookie(...cookies);

    // 1. PLAYページへ移動
    await page.goto(`https://www.streetfighter.com/6/buckler/ja-jp/profile/${userCode}/play`, {
      waitUntil: 'networkidle0',
      timeout: 60000 
    });

    // 2. 「キャラクター別対戦数」タブへ切り替え
    console.log("🖱️ 「キャラクター別対戦数」タブへ切り替えます...");
    const tabClicked = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('li, div, span, a')) as HTMLElement[];
      const target = allElements.find(el => 
        el.textContent?.trim() === 'キャラクター別対戦数' && 
        el.offsetParent !== null
      );
      if (target) {
        target.click();
        return true;
      }
      return false;
    });

    if (tabClicked) {
      await new Promise(r => setTimeout(r, 3000));
    } else {
      console.log("⚠️ タブが見つかりませんでした。");
    }

    // 3. キャラクター選択（選択 -> 変更するボタン押下）
    console.log(`🖱️ モーダルを開いて ${targetCharName} を選択し、確定ボタンを押します...`);
    const isChanged = await selectCharacter(page, targetCharName);
    
    if (!isChanged) {
      console.log("⚠️ キャラクターの切り替えに失敗しました");
    } else {
      console.log("✅ キャラクター切り替え完了！データ取得を開始します。");
    }

    // 4. データ取得
    console.log("📊 データを解析中...");
    const matchups = await page.evaluate(() => {
      const container = document.querySelector('article[class*="winning_rate"]');
      if (!container) return [];

      const items = container.querySelectorAll('li');
      const list: any[] = [];

      items.forEach(li => {
        // 名前と数値エリアを探す
        const nameEl = li.querySelector('[class*="winning_rate_name"]');
        const rateEl = li.querySelector('[class*="winning_rate_rate"]');
        const grafEl = li.querySelector('[class*="winning_rate_graf"]');
        
        // ★追加: アイコン画像の取得
        const imgEl = li.querySelector('img');
        
        if (nameEl) {
          const name = nameEl.textContent?.trim();
          if (!name || name === "ALL") return;

          const fullText = li.innerText || "";

          // 対戦数の抽出
          let count = "0戦";
          if (rateEl && rateEl.textContent?.includes("戦")) {
            count = rateEl.textContent.trim();
          } else {
            const countMatch = fullText.match(/(\d+)戦/);
            if (countMatch) count = countMatch[0];
          }

          // 勝率の抽出
          let rate = "---";
          const rateMatch = fullText.match(/(\d+(\.\d+)?)%/);
          if (rateMatch) {
            rate = rateMatch[0];
          } else if (grafEl) {
            // グラフの幅から推測
            const styleWidth = grafEl.getAttribute('style');
            if (styleWidth && styleWidth.includes('width')) {
              const widthMatch = styleWidth.match(/width:\s*(\d+(\.\d+)?)%/);
              if (widthMatch) rate = widthMatch[1] + "%";
            }
          }

          // ★追加: アイコンURLの処理
          let icon = "";
          if (imgEl) {
            const src = imgEl.getAttribute('src') || "";
            if (src.startsWith('/')) {
              icon = `https://www.streetfighter.com${src}`;
            } else {
              icon = src;
            }
          }

          list.push({
            opponent: name,
            count: count,
            rate: rate,
            icon: icon // ★データを追加
          });
        }
      });
      return list;
    });

    await browser.close();
    console.log(`✅ ${matchups.length}件のデータを取得`);
    
    return NextResponse.json({ data: matchups });

  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ★修正版: キャラクター選択処理（選択して「変更する」を押す）
// ★修正版: 以前のコードをベースに、2文字キャラ（ED, JP）用の分岐を追加
async function selectCharacter(page: any, targetName: string) {
  // A. プルダウン（モーダル）を開く
  const openResult = await page.evaluate(() => {
    const selector = document.querySelector('[class*="winning_rate_select_character"]');
    if (selector) {
      (selector as HTMLElement).click();
      return true;
    }
    return false;
  });
  
  if (!openResult) return false;
  
  // モーダルが開くのを待つ
  await new Promise(r => setTimeout(r, 1000));
    
  // B. キャラを選んでクリック
  const charSelected = await page.evaluate((name: string) => {
    // 文字を比較しやすくする関数（アルファベットと数字以外を削除して大文字化）
    // 例: "J.P." -> "JP", "Luke" -> "LUKE"
    const normalize = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    
    const targetClean = normalize(name); // 検索したい名前

    const allElements = Array.from(document.querySelectorAll('li, span, div')) as HTMLElement[];
    
    const targetEl = allElements.find(el => {
      // 要素が見えていない場合は除外
      if (el.offsetParent === null) return false;

      const textRaw = el.textContent || "";
      const textClean = normalize(textRaw); // 画面上の名前

      if (!textClean) return false;

      // ▼▼▼ ここで分岐させます ▼▼▼

      if (targetClean.length <= 2) {
        // ★パターン1: 名前が2文字以下の場合 (ED, JP)
        // 「完全一致」のみを許可します。
        // これにより "RANKED" (EDを含む) や "JA-JP" (JPを含む) を弾きます。
        return textClean === targetClean;
      } else {
        // ★パターン2: 名前が3文字以上の場合 (LUKE, RYU, ZANGIEF...)
        // 以前ご提示いただいた「元のロジック」を使用します。
        // "includes" を使うことで、多少の表記揺れがあってもヒットさせます。
        return textClean.includes(targetClean) && textClean.length < targetClean.length + 10;
      }
    });

    if (targetEl) {
      targetEl.click();
      return true;
    }
    return false;
  }, targetName);

  if (!charSelected) {
    console.log(`⚠️ モーダル内でキャラクター "${targetName}" が見つかりませんでした`);
    return false;
  }

  // 少し待つ（選択状態の反映）
  await new Promise(r => setTimeout(r, 500));

  // C. 「変更する」ボタンを押す
  console.log("🖱️ 「変更する」ボタンを探して押します...");
  try {
    const confirmClicked = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('button, div, a, span')) as HTMLElement[];
      const confirmBtn = allElements.find(el => 
        el.textContent?.trim() === '変更する' && 
        el.offsetParent !== null
      );

      if (confirmBtn) {
        confirmBtn.click();
        return true;
      }
      return false;
    });

    if (confirmClicked) {
      console.log("⏳ 変更ボタン押下。データ更新を待ちます...");
      await new Promise(r => setTimeout(r, 5000));
      return true;
    } else {
      console.error("❌ 「変更する」ボタンが見つかりませんでした！");
      return false;
    }
  } catch (e) {
    console.error("⚠️ ボタン押下エラー:", e);
    return false;
  }
}