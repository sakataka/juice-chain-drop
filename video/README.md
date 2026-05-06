# Juice Chain Drop Promo Video

HyperFrames で作成した `Juice Chain Drop` の短い紹介動画です。ゲーム本体とは分けて、動画生成関連のファイルをこの `video/` ディレクトリにまとめています。

## 構成

- `index.html` - HyperFrames composition
- `DESIGN.md` - 動画の色・書体・トーン定義
- `assets/screenshots/` - Playwright で取得したゲーム画面素材
- `scripts/capture-game-screenshots.mjs` - スクリーンショット取得スクリプト
- `output/fruit-puzzle-promo.mp4` - ローカル書き出し用 MP4。Git 管理しない
- `output/fruit-puzzle-promo.gif` - GitHub README 用のインラインプレビュー。Git 管理する
- `package.json` - 動画関連コマンド

## 環境

- Node.js 22 以上が必要です。この作業時は Node.js `v24.15.0` と `v25.9.0` が利用されました。
- FFmpeg が必要です。この作業時は FFmpeg `8.1` を確認しました。
- HyperFrames CLI は `npx hyperframes` で利用します。この作業時は `v0.4.34` でした。

## コマンド

ゲームを起動:

```bash
bun run dev -- --host 127.0.0.1 --port 4178
```

スクリーンショット取得:

```bash
cd video
bun run capture
```

HyperFrames 環境確認:

```bash
cd video
bun run doctor
```

Lint:

```bash
cd video
bun run lint
```

`composition_file_too_large` はこの動画では許容する警告として `bun run lint` から除外しています。HyperFrames CLI の素の出力を見たい場合は次を使います。

```bash
cd video
bun run lint:raw
```

レイアウト検査:

```bash
cd video
bun run inspect
```

Preview:

```bash
cd video
bun run preview
```

Render:

```bash
cd video
bun run render
```

README 用 GIF 生成:

```bash
cd video
bun run gif
```

今のゲーム画面を撮り直して、lint / inspect / render までまとめて実行:

```bash
cd video
bun run promo:update
```

スクリーンショットを撮り直さず、composition の調整だけ反映して再生成:

```bash
cd video
bun run promo:update:no-capture
```

Codex にはローカル skill `.agents/skills/juice-chain-promo-video/SKILL.md` も追加しています。今後は「今の機能に合わせて紹介動画を更新して」のように依頼すれば、この動画更新フローを使えます。

直接実行する場合:

```bash
cd video
npx hyperframes render --output output/fruit-puzzle-promo.mp4 --quality standard --fps 30
```

## 動画内容

- 形式: MP4
- 解像度: 1920 x 1080
- 長さ: 15.2 秒
- 言語: 日本語
- 音声: なし

構成:

- 0.0-2.65 秒: タイトルと新UIの開始画面
- 2.35-5.4 秒: 実プレイ開始と Next / Mode / Shipping の見え方
- 5.15-9.0 秒: 3連鎖以上のスプラッシュ演出とスコア上昇の見せ場
- 8.65-12.4 秒: Shipping と注文、ジュースを使うか温存するかの判断
- 12.15-15.2 秒: 締め

## 使用素材

- `assets/screenshots/title.png`
- `assets/screenshots/gameplay-start.png`
- `assets/screenshots/gameplay-01.png`
- `assets/screenshots/gameplay-combo.png`
- `assets/screenshots/score.png`
- `../src/assets/effects/lab/juice-splash.png`

## ナレーション原稿案

フルーツを落として、つなげて、ジュースを作ろう。連鎖でスコアを伸ばし、ジュース効果と出荷ボーナスでさらに狙う。短時間で遊べる、フルーツ落ち物パズル。

## README 用紹介文

40文字程度:

> フルーツを落としてジュースを作る、連鎖型の落ち物パズル。

80文字程度:

> フルーツを落として4つ以上つなげ、ジュース効果と出荷ボーナスでスコアを伸ばす落ち物パズルです。

150文字程度:

> `Juice Chain Drop` は、2つ1組のフルーツを落として同じ種類を4つ以上つなげ、連鎖、ジュース効果、出荷ボーナスでハイスコアを目指す落ち物パズルゲームです。Next、Mode、Shipping、Juices を見ながら、攻めるか温存するかを短時間で判断して遊べます。

## README 埋め込み例

GitHub README では、リポジトリ内 MP4 をリンクしてもインライン再生されず、ファイル表示やリポジトリ表示になることがあります。YouTube などを使わずに確実に見せる場合は、GIF を画像として埋め込みます。MP4 はローカル生成物として扱い、リポジトリには含めません。

```md
![Juice Chain Drop promo](video/output/fruit-puzzle-promo.gif)
```

公開リポジトリで絶対 URL にする場合:

```md
![Juice Chain Drop promo](https://raw.githubusercontent.com/sakataka/juice-chain-drop/main/video/output/fruit-puzzle-promo.gif)
```

GitHub の issue / PR / discussion コメント欄に MP4 をドラッグ&ドロップすると、`https://github.com/user-attachments/assets/...` 形式の URL が発行されます。ただし README での表示は GitHub 側の挙動に依存するため、このリポジトリでは GIF 埋め込みを基本にします。

```md
https://github.com/user-attachments/assets/your-uploaded-video-id
```

## 次に改善できること

- 9:16 縦長ショート版を `video/shorts/` や別 composition として追加する
- ゲームプレイを静止画ではなく短い画面録画素材に差し替える
- BGM / SE / 日本語ナレーションを追加する
- `index.html` を `compositions/` 配下の scene ごとに分割して lint 警告を解消する
