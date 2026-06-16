/**
 * 应用版本号 —— 直接从 app.json 读取，Metro 打包时自动内联，始终与 app.json 同步
 */
import appJson from '../../app.json';
export const APP_VERSION: string = (appJson as { expo?: { version?: string } })?.expo?.version ?? '1.0.0';
