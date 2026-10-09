module.exports = {
  apps: [
    {
      name: "agent-memory",
      script: "src/server.ts",
      interpreter: "node",
      cwd: __dirname,
      env: { PORT: 4100 },
    },
  ],
};
