declare module "*.css";
declare module "*?inline" { const dataUrl: string; export default dataUrl; }
declare module "*.png" { const url: string; export default url; }
