// packages/contracts/src/package.ts
var PACKAGE_NAME = "dsh-glass-theme";

// packages/host/src/index.ts
import { registerRoutes } from "./routes.js";
import { registerSettings } from "./settings.js";
import { Config } from "./settings.js";
import { registerWorkspaceRoutes } from "./workspace.js";
var name = PACKAGE_NAME;
function apply(ctx, config) {
  if (typeof ctx.inject === "function") ctx.inject(["webServer"], (scope) => {
    registerRoutes(ctx, scope);
    registerWorkspaceRoutes(ctx, scope, config);
  });
  else {
    registerRoutes(ctx, ctx);
    registerWorkspaceRoutes(ctx, ctx, config);
  }
  registerSettings(ctx);
}
export {
  Config,
  apply,
  name
};
