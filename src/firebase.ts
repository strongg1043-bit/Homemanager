import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAtVpAu_3NErApc0_Wf9JqJdmluypxMV5I",
  authDomain: "homemanager-c409a.firebaseapp.com",
  projectId: "homemanager-c409a",
  storageBucket: "homemanager-c409a.firebasestorage.app",
  messagingSenderId: "1052149864469",
  appId: "1:1052149864469:web:71f7a94186512ae3a7d61c"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
