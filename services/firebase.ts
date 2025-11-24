import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 선생님이 제공해주신 Firebase 설정값
const firebaseConfig = {
  apiKey: "AIzaSyCQSB1pbIz5LPejUD15yTMaq6QfN6_FbXY",
  authDomain: "school-out-85e4b.firebaseapp.com",
  projectId: "school-out-85e4b",
  storageBucket: "school-out-85e4b.firebasestorage.app",
  messagingSenderId: "530400564226",
  appId: "1:530400564226:web:53f2d9b103a0c8ea43831b",
  measurementId: "G-PPK0PGY6BT"
};

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// 데이터베이스(Firestore) 기능 초기화 및 내보내기
export const db = getFirestore(app);