import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Use the custom database ID if specified in the config, otherwise default
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
const storage = getStorage(app);

export { app, auth, db, storage, signInAnonymously };

