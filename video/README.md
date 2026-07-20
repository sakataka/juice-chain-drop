# Juice Chain Drop Promo Video

HyperFrames で作成した `Juice Chain Drop` の短い紹介動画です。ゲーム本体とは分けて、動画生成関連のファイルをこの `video/` ディレクトリにまとめています。

## 構成

- `index.html` - HyperFrames composition
- `DESIGN.md` - 動画の色・書体・トーン定義
- `assets/screenshots/` - Playwright で取得するローカル生成素材。Git 管理しない
- `scripts/capture-game-screenshots.mjs` - スクリーンショット取得スクリプト
- `output/fruit-puzzle-promo.mp4` - ローカル書き出し用 MP4。Git 管理しない
- `output/fruit-puzzle-promo.gif` - ローカル確認用 GIF。Git 管理しない
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

ローカル確認用 GIF 生成:

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
- 2.35-5.4 秒: Auto PlayでAIの連鎖を眺める体験と、局面に応じて変化するBGM
- 5.15-9.0 秒: 連鎖でボトルが完成し、Next Dropへ入る流れ
- 8.65-12.4 秒: ボトルを盤面へ落として着弾効果を狙うJuice Drop
- 12.15-15.2 秒: 締め

## 使用素材

- `assets/screenshots/title.png`
- `assets/screenshots/gameplay-start.png`
- `assets/screenshots/gameplay-01.png`
- `assets/screenshots/gameplay-combo.png`
- `assets/screenshots/juice-drop.png`
- `assets/screenshots/score.png`

## ナレーション原稿案

フルーツを落として、つなげて、ジュースを作ろう。Auto PlayならAIが生む連鎖を眺めながら、局面で変わるBGMと果汁のリズムを楽しめる。完成したボトルを狙った場所へ落として果汁を弾けさせ、さらに連鎖をつなぐフルーツ落ち物パズル。

## 紹介文案

40文字程度:

> フルーツを落としてジュースを作る、連鎖型の落ち物パズル。

80文字程度:

> フルーツを4つ以上つなげてボトルを作り、そのボトルを盤面へ落として次の連鎖を生む落ち物パズルです。

150文字程度:

> `Juice Chain Drop` は、2つ1組のフルーツを落として同じ種類を4つ以上つなげ、果汁をボトルへ搾る落ち物パズルゲームです。完成したボトルはNext Dropへ入り、着地点から果汁を弾けさせて盤面を変え、次の連鎖とボトルへつなげます。

## 生成物の管理

ゲーム画面キャプチャ、MP4、GIF は容量が大きいため、すべてローカル生成物として扱い、GitHub には含めません。必要なときだけ `bun run promo:update` で再生成してください。

## 次に改善できること

- 9:16 縦長ショート版を `video/shorts/` や別 composition として追加する
- ゲームプレイを静止画ではなく短い画面録画素材に差し替える
- ゲーム本体のアダプティブBGMを動画用ミックスにして追加する
- `index.html` を `compositions/` 配下の scene ごとに分割して lint 警告を解消する
