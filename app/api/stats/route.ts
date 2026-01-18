import { NextResponse, NextRequest } from 'next/server';
import puppeteer from 'puppeteer';

// ★追加: icon (画像のURL) を定義
type CharData = { name: string; lp: string; mr: string; winRate: string; icon: string };

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userCode = searchParams.get('userCode');

    if (!userCode) return NextResponse.json({ error: "ユーザーコードがありません" }, { status: 400 });

    console.log(`🚀 取得開始: ${userCode}`);

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

    // --- [Phase 1] 勝率データの取得 ---
    console.log("📊 [Phase 1] 勝率データを取得中...");
    const winRateData = await page.evaluate(() => {
      const container = document.querySelector('article[class*="winning_rate"]');
      if (!container) return [];
      const items = container.querySelectorAll('li');
      const list: {name: string, rate: string, icon: string}[] = [];
      items.forEach(li => {
        const name = li.querySelector('[class*="winning_rate_name"]')?.textContent?.trim();
        const rate = li.querySelector('[class*="winning_rate_rate"]')?.textContent?.trim();
        // ★追加: 画像URLの取得
        const img = li.querySelector('img');
        let icon = "";
        if (img) {
          const src = img.getAttribute('src') || "";
          if (src.startsWith('/')) icon = `https://www.streetfighter.com${src}`;
          else icon = src;
        }

        if (name) list.push({ name, rate: rate || "-", icon });
      });
      return list;
    });

    // --- [Phase 2] LPタブへ切り替え ---
    console.log("🖱️ [Phase 2] LPタブをクリック...");
    await clickTab(page, 'キャラクター別リーグポイント');
    await new Promise(r => setTimeout(r, 3000));

    // --- [Phase 3] LPデータの取得 ---
    console.log("📊 [Phase 3] LPデータを取得中...");
    const lpData = await page.evaluate(() => {
      const container = document.querySelector('article[class*="league_point"]');
      if (!container) return [];
      const items = container.querySelectorAll('li');
      const list: {name: string, lp: string, icon: string}[] = [];
      items.forEach(li => {
        const nameEl = li.querySelector('[class*="league_point_name"]');
        const lpEl = li.querySelector('[class*="league_point_lp"]');
        // ★追加: 画像URLの取得
        const img = li.querySelector('img');
        let icon = "";
        if (img) {
          const src = img.getAttribute('src') || "";
          if (src.startsWith('/')) icon = `https://www.streetfighter.com${src}`;
          else icon = src;
        }

        if (nameEl) list.push({ name: nameEl.textContent?.trim() || "", lp: lpEl?.textContent?.trim() || "0", icon });
      });
      return list;
    });

    // --- [Phase 4] MRタブへ切り替え ---
    console.log("🖱️ [Phase 4] MRタブをクリック...");
    const mrClicked = await clickTab(page, 'キャラクター別マスターレート');
    let mrData: {name: string, mr: string}[] = [];

    if (mrClicked) {
      await new Promise(r => setTimeout(r, 3000));
      // --- [Phase 5] MRデータの取得 ---
      console.log("📊 [Phase 5] MRデータを取得中...");
      mrData = await page.evaluate(() => {
        const container = document.querySelector('article[class*="master_rate"]');
        if (!container) return [];
        const items = container.querySelectorAll('li');
        const list: {name: string, mr: string}[] = [];
        items.forEach(li => {
          const nameEl = li.querySelector('[class*="league_point_name"]');
          const mrEl = li.querySelector('[class*="league_point_mr"]');
          if (nameEl) {
            list.push({ 
              name: nameEl.textContent?.trim() || "", 
              mr: mrEl?.textContent?.trim() || "---" 
            });
          }
        });
        return list;
      });
    }

    await browser.close();

    // --- データの合体 ---
    const mergedData: CharData[] = winRateData.map(winItem => {
      const lpMatch = lpData.find(l => l.name.toUpperCase() === winItem.name.toUpperCase());
      const mrMatch = mrData.find(m => m.name.toUpperCase() === winItem.name.toUpperCase());
      
      // 画像はLPタブの方が高画質かもしれないので、あればそちらを採用
      const bestIcon = lpMatch?.icon || winItem.icon || "";

      return {
        name: winItem.name,
        lp: lpMatch ? lpMatch.lp : "---",
        mr: mrMatch ? mrMatch.mr : "",
        winRate: winItem.rate,
        icon: bestIcon // ★追加
      };
    });

    return NextResponse.json({ source: "live", data: mergedData });

  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ヘルパー関数: タブクリック
async function clickTab(page: any, searchText: string) {
  return await page.evaluate((text: string) => {
    const allElements = Array.from(document.querySelectorAll('li, div, span, a, p')) as HTMLElement[];
    const target = allElements.find(el => {
      const t = el.textContent?.trim() || "";
      return t.includes(text) && t.length < 50 && el.offsetParent !== null;
    });
    if (target) {
      target.click();
      return true;
    }
    return false;
  }, searchText);
}