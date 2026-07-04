import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCvmu_JSYyBwzyUEJ_Q3M0dzQSAVx1-3Qk",
  authDomain: "netbet-794ad.firebaseapp.com",
  projectId: "netbet-794ad",
  storageBucket: "netbet-794ad.firebasestorage.app",
  messagingSenderId: "959195916453",
  appId: "1:959195916453:web:e66b793c5234ef3b4f454c"
};


const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);