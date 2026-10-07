import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import path from "node:path";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  poweredByHeader: false,
  serverExternalPackages: [
    "@myriaddreamin/typst.ts",
    "@myriaddreamin/typst-ts-web-compiler",
  ],
  webpack(config, { webpack }) {
    config.resolve.alias["xdg-app-paths"] = path.resolve(process.cwd(), "lib/shims/xdg-app-paths.cjs");
    config.plugins.push(new webpack.DefinePlugin({ "process.argv[0]": JSON.stringify("node") }));
    return config;
  },
};

export default withWorkflow(nextConfig);
