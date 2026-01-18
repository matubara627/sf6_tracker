'use client';

import React, { useState } from 'react';

// 型定義を更新: text ではなく rate と count を持つように変更
type CharData = { name: string; lp: string; mr: string; winRate: string };
type MatchupData = { opponent: string; rate: string; count: string };

export default function Home() {
  const [userCode, setUserCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<CharData[]>([]);
  const [error, setError] = useState('');
  
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [matchups, setMatchups] = useState<MatchupData[]>([]);
  const [loadingMatchups, setLoadingMatchups] = useState(false);

  // 検索処理
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userCode) return;
    setLoading(true);
    setError('');
    setStats([]);
    setSelectedChar(null);

    try {
      const res = await fetch(`/api/stats?userCode=${userCode}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'エラーが発生しました');
      setStats(json.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // キャラクタークリック時の処理
  const handleCharClick = async (charName: string) => {
    setSelectedChar(charName);
    setMatchups([]);
    setLoadingMatchups(true);

    try {
      const res = await fetch(`/api/matchups?userCode=${userCode}&character=${charName}`);
      const json = await res.json();
      if (res.ok) {
        setMatchups(json.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMatchups(false);
    }
  };

  const closePopup = () => {
    setSelectedChar(null);
    setMatchups([]);
  };

  const parseNum = (str: string) => parseInt(str.replace(/[^0-9]/g, '')) || 0;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-yellow-500 mb-2">SF6 Character Tracker</h1>
        <p className="text-gray-400">ユーザーコードを入力してLP/MR/勝率を一括チェック</p>
      </header>

      {/* 検索フォーム */}
      <div className="max-w-md mx-auto mb-10">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            placeholder="ユーザーコード (例: 1415778165)"
            value={userCode}
            onChange={(e) => setUserCode(e.target.value)}
            className="flex-1 p-3 rounded bg-gray-800 border border-gray-600 focus:border-yellow-500 focus:outline-none text-white"
          />
          <button 
            type="submit" 
            disabled={loading}
            className="bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-3 px-6 rounded transition disabled:opacity-50"
          >
            {loading ? '検索中...' : '検索'}
          </button>
        </form>
        {error && <p className="text-red-400 mt-2 text-center">{error}</p>}
      </div>

      {/* キャラクターリスト */}
      {stats.length > 0 ? (
        <div className="max-w-4xl mx-auto grid grid-cols-1 gap-6">
          <h2 className="text-2xl font-bold border-b border-gray-700 pb-2">キャラクター別成績</h2>
          {stats.map((char, index) => (
            <div 
              key={index} 
              className="bg-gray-800 p-4 rounded-lg flex items-center shadow-lg border border-gray-700 cursor-pointer hover:bg-gray-750 hover:border-yellow-500 transition"
              onClick={() => handleCharClick(char.name)}
            >
              <div className="w-1/4">
                <div className="text-xl font-bold text-yellow-500">{char.name}</div>
                <div className="text-sm text-gray-400">勝率: {char.winRate}</div>
                <div className="text-xs text-blue-400 mt-2">▶ 詳細を見る</div>
              </div>

              <div className="flex-1 ml-4">
                <div className="flex justify-between items-end mb-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm text-blue-300 font-bold">LP</span>
                    <span className="text-lg font-bold text-white">{char.lp}</span>
                  </div>
                  {char.mr && parseNum(char.mr) > 0 && (
                    <div className="flex items-baseline gap-2 bg-purple-900 px-3 py-1 rounded ml-4 border border-purple-500">
                      <span className="text-sm text-purple-300 font-bold">MR</span>
                      <span className="text-xl font-bold text-white">{char.mr}</span>
                    </div>
                  )}
                </div>
                <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden relative">
                  <div 
                    className="bg-blue-500 h-full rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min((parseNum(char.lp) / 30000) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !loading && !error && <p className="text-center text-gray-500">データを検索してください</p>
      )}

      {/* ポップアップ（モーダル）修正版 */}
      {selectedChar && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 p-4" onClick={closePopup}>
          <div className="bg-gray-900 border border-yellow-600 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            
            <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
              <h2 className="text-3xl font-bold text-white">
                <span className="text-yellow-500">{selectedChar}</span> vs キャラクター別成績
              </h2>
              <button onClick={closePopup} className="text-gray-400 hover:text-white text-2xl font-bold">×</button>
            </div>

            {loadingMatchups ? (
              <div className="flex flex-col items-center justify-center py-10">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mb-4"></div>
                <p className="text-lg animate-pulse">データを収集・統合中...</p>
                <p className="text-sm text-gray-500 mt-2">勝率と対戦数の両方を取得するため、少し時間がかかります。</p>
              </div>
            ) : matchups.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {matchups.map((m, i) => (
                  <div key={i} className="bg-gray-800 p-3 rounded border border-gray-600 flex flex-col items-center hover:bg-gray-750 transition">
                    <span className="text-xs text-gray-400 mb-1">VS</span>
                    <span className="text-xl font-bold text-white mb-2">{m.opponent}</span>
                    
                    <div className="flex items-center justify-between w-full px-2 mt-1 bg-gray-900 py-2 rounded">
                        {/* 勝率表示 */}
                        <div className="flex flex-col items-center w-1/2 border-r border-gray-700">
                            <span className="text-xs text-gray-500">勝率</span>
                            <span className={`font-bold ${parseNum(m.rate) >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                                {m.rate}
                            </span>
                        </div>
                        {/* 対戦数表示 */}
                        <div className="flex flex-col items-center w-1/2">
                            <span className="text-xs text-gray-500">対戦数</span>
                            <span className="font-bold text-blue-300">
                                {m.count}
                            </span>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-gray-400 bg-gray-800 rounded">
                <p className="text-xl mb-2">データが見つかりませんでした</p>
                <p className="text-sm">対戦データが存在しない可能性があります。</p>
              </div>
            )}
            
            <div className="mt-6 text-center">
              <button onClick={closePopup} className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-6 rounded transition">
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}