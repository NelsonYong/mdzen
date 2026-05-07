# Example

独立运行 `@mdzen/pet`,不依赖 mdzen。

```bash
pnpm --filter @mdzen/pet build:client
node --experimental-strip-types packages/pet/example/server.ts
# open http://localhost:4000
```

应该看到一个像素小人在页面右下角漫游。Phase 1 不接 LLM。
