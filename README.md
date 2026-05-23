# Kickboxing Training

GitHub Pages向けの静的なキックボクシング練習メニュー管理アプリです。

- HTML/CSS/JavaScriptのみ
- localStorage保存
- Service Workerによるオフライン対応
- PWA manifest対応
- 通知音はWeb Audio APIで生成

## ローカル確認

静的ファイルですが、Service Worker確認のためローカルサーバー経由で開いてください。

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

その後、`http://127.0.0.1:8000` を開きます。
