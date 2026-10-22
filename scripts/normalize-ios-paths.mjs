import fs from 'node:fs';
const path = new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url);
if (fs.existsSync(path)) {
  const source = fs.readFileSync(path, 'utf8');
  // Capacitor generated on Windows can emit backslashes in Swift package paths.
  fs.writeFileSync(
    path,
    source.replace(/path: "([^"\r\n]+)"/g, (_, value) => `path: "${value.replaceAll('\\', '/')}"`),
  );
}
