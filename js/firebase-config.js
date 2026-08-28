import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDf5LjSwUoFN8g6VBpoRR3v15VUWPCF5M4",
    authDomain: "simuladores-99c1e.firebaseapp.com",
    projectId: "simuladores-99c1e",
    storageBucket: "simuladores-99c1e.firebasestorage.app",
    messagingSenderId: "1048172617482",
    appId: "1:1048172617482:web:10a77eea8e21e0900e64f3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };