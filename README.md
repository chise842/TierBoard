# TierBoard

ブラウザでティア表を作るアプリです。`index.html` を開くだけで使えます。データはこのブラウザの中に保存されます。

## できること

- テキストや画像の項目を追加し、ドラッグでティアに並べる
- ティアの追加、名前と色の変更、並べ替え
- ボードを複数保存し、複製や切り替えができる
- JSON の書き出しと読み込み
- PNG 画像としての保存

## ファイル構成

- `index.html` — 画面の骨組み
- `css/tokens.css` — 色と文字の基準
- `css/base.css` — 共通の土台とボタン
- `css/header.css` — 上部バー
- `css/board.css` — ティア、項目、ドラッグ中の見た目
- `css/dialog.css` — ダイアログ、メニュー、選択バー
- `js/store.js` — データと保存
- `js/images.js` — 画像の読み込みと縮小
- `js/render.js` — 画面への描画
- `js/drag.js` — ドラッグ＆ドロップ
- `js/export.js` — JSON / PNG の書き出し
- `js/main.js` — 操作の接続
