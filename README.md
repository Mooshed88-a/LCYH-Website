# 凌城烟火网页

静态宣传网页项目。

- `index.html`：主页施工中提示，并自动跳转到服务器介绍页。
- `intro/index.html`：由 Markdown 宣传文案生成的服务器介绍页。
- `content/凌城烟火宣传文案.md`：介绍页源文案。
- `assets/media/`：构建时归档的页面图片素材。

更新介绍页：

```bash
npm run build
```

验证页面基础渲染：

```bash
npm run verify
```
