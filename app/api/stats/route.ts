import { NextResponse, NextRequest } from 'next/server';
import puppeteer from 'puppeteer';

// データ型の定義に mr を追加
type CharData = { name: string; lp: string; mr: string; winRate: string };

// キャッシュの設定
let cache: Record<string, { data: CharData[], lastFetch: number }> = {};
const COOLDOWN = 1000 * 60 * 30;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userCode = searchParams.get('userCode');

    if (!userCode) return NextResponse.json({ error: "ユーザーコードがありません" }, { status: 400 });

    const now = Date.now();
    // キャッシュチェック（必要なら有効化してください）
    // if (cache[userCode] && (now - cache[userCode].lastFetch < COOLDOWN)) { ... }

    console.log(`🚀 取得開始: ${userCode}`);

    const browser = await puppeteer.launch({
      headless: false, // 画面を表示
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
        return NextResponse.json({ error: "Cookieが設定されていません" }, { status: 500 });
    }
    const cookies = cookieString.split(';').map((c) => {
      const parts = c.trim().split('=');
      return { name: parts[0], value: parts.slice(1).join('='), domain: '.streetfighter.com' };
    });
    await page.setCookie(...cookies);

    // 1. ページへ移動
    await page.goto(`https://www.streetfighter.com/6/buckler/ja-jp/profile/${userCode}/play`, {
      waitUntil: 'networkidle0',
      timeout: 60000 
    });

    // --- [Step A] 勝率データの取得 ---
    console.log("📊 [Step A] 勝率データを取得中...");
    const winRateData = await page.evaluate(() => {
      const container = document.querySelector('article[class*="winning_rate"]');
      if (!container) return [];
      const items = container.querySelectorAll('li');
      const list: {name: string, rate: string}[] = [];
      items.forEach(li => {
        const name = li.querySelector('[class*="winning_rate_name"]')?.textContent?.trim();
        const rate = li.querySelector('[class*="winning_rate_rate"]')?.textContent?.trim();
        if (name) list.push({ name, rate: rate || "-" });
      });
      return list;
    });

    // --- [Step B] LPタブへ切り替え ---
    console.log("🖱️ [Step B] LPタブをクリック...");
    await clickTab(page, 'キャラクター別リーグポイント');
    await new Promise(r => setTimeout(r, 3000));

    // --- [Step C] LPデータの取得 ---
    console.log("📊 [Step C] LPデータを取得中...");
    const lpData = await page.evaluate(() => {
      const container = document.querySelector('article[class*="league_point"]');
      if (!container) return [];
      const items = container.querySelectorAll('li');
      const list: {name: string, lp: string}[] = [];
      items.forEach(li => {
        const nameEl = li.querySelector('[class*="league_point_name"]'); // 名前
        const lpEl = li.querySelector('[class*="league_point_lp"]');     // LP
        if (nameEl) list.push({ name: nameEl.textContent?.trim() || "", lp: lpEl?.textContent?.trim() || "0" });
      });
      return list;
    });

    // --- [Step D] MRタブへ切り替え (新規追加) ---
    console.log("🖱️ [Step D] MRタブをクリック...");
    const mrClicked = await clickTab(page, 'キャラクター別マスターレート');
    
    let mrData: {name: string, mr: string}[] = [];

    if (mrClicked) {
      await new Promise(r => setTimeout(r, 3000)); // 読み込み待ち

      // --- [Step E] MRデータの取得 (新規追加) ---
      console.log("📊 [Step E] MRデータを取得中...");
      mrData = await page.evaluate(() => {
        // ★提供された画像に基づき、master_rate を含む article を探す
        const container = document.querySelector('article[class*="master_rate"]');
        if (!container) return [];

        const items = container.querySelectorAll('li');
        const list: {name: string, mr: string}[] = [];

        items.forEach(li => {
          // ★提供された画像に基づき、league_point_mr を含むタグを探す
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
      console.log(`✅ MRデータ取得数: ${mrData.length}件`);
    } else {
      console.log("⚠️ MRタブが見つからないか、マスター到達キャラがいません");
    }

    await browser.close();

    // --- データの合体 (LP, MR, 勝率) ---
    const mergedData: CharData[] = winRateData.map(winItem => {
      // 名前でマッチング
      const lpMatch = lpData.find(l => l.name.toUpperCase() === winItem.name.toUpperCase());
      const mrMatch = mrData.find(m => m.name.toUpperCase() === winItem.name.toUpperCase());
      
      return {
        name: winItem.name,
        lp: lpMatch ? lpMatch.lp : "---",
        mr: mrMatch ? mrMatch.mr : "", // MRがなければ空文字
        winRate: winItem.rate
      };
    });

    cache[userCode] = { data: mergedData, lastFetch: now };
    return NextResponse.json({ source: "live", data: mergedData });

  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// タブをクリックするヘルパー関数
async function clickTab(page: any, searchText: string) {
  return await page.evaluate((text: string) => {
    const allElements = Array.from(document.querySelectorAll('li, div, span, a, p')) as HTMLElement[];
    const target = allElements.find(el => {
      const t = el.textContent?.trim() || "";
      // 文字を含み、かつ長すぎない要素をクリック
      return t.includes(text) && t.length < 50 && el.offsetParent !== null;
    });
    if (target) {
      target.click();
      return true;
    }
    return false;
  }, searchText);
}