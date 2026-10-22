import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hanzi100.mobile',
  appName: '汉字百词斩',
  webDir: 'dist',
  backgroundColor: '#f5f7f8',
  android: { minWebViewVersion: 108 },
  ios: { contentInset: 'never' },
  plugins: {
    CapacitorSQLite: { iosDatabaseLocation: 'Library/CapacitorDatabase' },
    StatusBar: { style: 'LIGHT', backgroundColor: '#f5f7f8' },
  },
};
export default config;
