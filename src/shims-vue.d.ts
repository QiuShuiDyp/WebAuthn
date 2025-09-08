declare module 'vue' {
  // Minimal declarations to satisfy editor/linter in this workspace
  export const createApp: any;
}

declare module '*.vue' {
  const component: any;
  export default component;
}


