import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 현재 환경 변수 로드 (API KEY 등)
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    base: "/School-Out/",  // <--- 이 부분이 꼭 있어야 합니다!
    plugins: [react()],
    define: {
      // 코드에서 process.env.API_KEY를 사용할 수 있도록 값을 치환해줍니다.
      // 만약 .env 파일이 없다면 빈 문자열로 처리하여 오류를 방지합니다.
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      'process.env': {}
    }
  }
})
