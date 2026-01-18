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

    // 2. 検索ボタン（虫眼鏡アイコンなど）をクリックして検索バーを開く
    // ※ページのデザインによっては最初から開いている場合もありますが、念のため検索ボックスを探します
    console.log("🔍 検索ボックスを探しています...");
    
    // 検索入力欄に入力
    const inputResult = await page.evaluate((targetName) => {
      // プレースホルダーや種類で入力欄を探す
      const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      // "Fighter ID" や "Search" っぽい入力欄を探す
      const searchInput = inputs.find(el => {
        const p = el.getAttribute('placeholder') || "";
        return p.includes("ID") || p.includes("Fighter") || p.includes("検索");
      }) as HTMLInputElement;

      if (searchInput) {
        searchInput.value = targetName;
        // Reactなどのイベントを発火させる
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    }, name);

    if (!inputResult) {
      await browser.close();
      return NextResponse.json({ error: "検索ボックスが見つかりませんでした" }, { status: 404 });
    }

    // 3. 検索実行（Enterキー、または検索ボタン押下）
    console.log("🖱️ 検索を実行します...");
    await page.keyboard.press('Enter');
    
    // 検索結果が出るのを待つ
    await new Promise(r => setTimeout(r, 4000));

    // 4. 結果リストの一番上を取得
    const userCode = await page.evaluate(() => {
      // 検索結果のリスト（li）を探す
      // クラス名は不明だが、fighters_list みたいな場所にあるはず
      const links = Array.from(document.querySelectorAll('a'));
      
      // リンク先が "/profile/数字" になっているものを探す
      const profileLink = links.find(a => {
        const href = a.getAttribute('href') || "";
        // /profile/1234567890 のような形式
        return href.match(/\/profile\/\d+$/);
      });

      if (profileLink) {
        const href = profileLink.getAttribute('href') || "";
        const match = href.match(/\/profile\/(\d+)$/);
        return match ? match[1] : null;
      }
      return null;
    });

    await browser.close();

    if (userCode) {
      console.log(`✅ ID発見: ${userCode}`);
      return NextResponse.json({ userCode });
    } else {
      return NextResponse.json({ error: "プレイヤーが見つかりませんでした" }, { status: 404 });
    }

  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}