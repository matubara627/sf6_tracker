import { NextResponse, NextRequest } from 'next/server';
import puppeteer from 'puppeteer';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get('name');

    if (!name) return NextResponse.json({ error: "名前がありません" }, { status: 400 });

    console.log(`🚀 ID検索開始: 名前 "${name}" を探します`);

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

    // 1. ファイターズリスト（検索ページ）へ移動
    await page.goto('https://www.streetfighter.com/6/buckler/ja-jp/fighters', {
      waitUntil: 'networkidle0',
      timeout: 60000 
    });

    // 2. 検索ボックスへの入力
    console.log("🔍 検索ボックスを探しています...");
    const inputResult = await page.evaluate((targetName) => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      const searchInput = inputs.find(el => {
        const p = el.getAttribute('placeholder') || "";
        return p.includes("ID") || p.includes("Fighter") || p.includes("検索");
      }) as HTMLInputElement;

      if (searchInput) {
        searchInput.value = targetName;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    }, name);

    if (!inputResult) {
      await browser.close();
      return NextResponse.json({ error: "検索ボックスが見つかりませんでした" }, { status: 404 });
    }

    // 3. 検索実行
    console.log("🖱️ 検索を実行します...");
    await page.keyboard.press('Enter');
    
    // 結果が出るのを待つ
    await new Promise(r => setTimeout(r, 4000));

    // 4. ★変更点: 結果リストを「すべて」取得する
    console.log("📋 検索結果リストを取得します...");
    
    const players = await page.evaluate(() => {
      // 検索結果のリストアイテムを探す (liタグの中に a href="/profile/..." がある構造)
      const listItems = Array.from(document.querySelectorAll('li'));
      const results: { name: string, userCode: string, info: string }[] = [];

      listItems.forEach(li => {
        const link = li.querySelector('a[href*="/profile/"]');
        if (link) {
          const href = link.getAttribute('href') || "";
          const match = href.match(/\/profile\/(\d+)$/);
          
          if (match) {
            // 名前を取得 (タグ構造は不明だが、リンク内のテキストを拾えばOK)
            // 必要に応じて img の alt属性や特定のクラス名から拾うとより精度が上がります
            let name = link.textContent?.trim() || "Unknown";
            // 余計な改行などを整理
            name = name.replace(/\s+/g, ' '); 

            // 追加情報（リーグランクなどがあれば拾う）
            const info = li.innerText.replace(/\s+/g, ' ').substring(0, 50); // 補足情報として少しテキストを保持

            results.push({
              name: name,
              userCode: match[1], // URLから数字IDを抽出
              info: info
            });
          }
        }
      });
      
      return results;
    });

    await browser.close();

    console.log(`✅ ${players.length}件のプレイヤーが見つかりました`);
    return NextResponse.json({ players });

  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}