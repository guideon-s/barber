import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBdEfo7jn_tp4EZMwjCbuoX68Thx7jJjJg",
  authDomain: "barber-shop-c7fc7.firebaseapp.com",
  projectId: "barber-shop-c7fc7",
  storageBucket: "barber-shop-c7fc7.firebasestorage.app",
  messagingSenderId: "990884549816",
  appId: "1:990884549816:web:2abca8f887b2b928b6584d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export function estaDentroDeHorario(horaStr) {
  if (!horaStr || !horaStr.includes(":")) return false;
  const [hStr, mStr] = horaStr.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const minutos = h * 60 + m;
  return minutos >= 17 * 60 && minutos <= 22 * 60;
}

export async function guardarCitaYCliente(citaObj) {
  await addDoc(collection(db, "citas"), citaObj);

  const clienteRef = doc(db, "clientes", citaObj.codigo.toLowerCase());
  const snap = await getDoc(clienteRef);

  if (snap.exists()) {
    const dataActual = snap.data();
    const actualizado = {
      ...dataActual,
      nombre: citaObj.nombre,
      apellido: citaObj.apellido,
      telefono: citaObj.telefono,
      ultimaCita: `${citaObj.fechaMX} ${citaObj.hora}`,
      estadoCita: citaObj.estado || "Pendiente"
    };
    await updateDoc(clienteRef, actualizado);
    return actualizado;
  } else {
    const nuevoCliente = {
      codigo: citaObj.codigo.toLowerCase(),
      nombre: citaObj.nombre,
      apellido: citaObj.apellido,
      telefono: citaObj.telefono,
      sellos: 0,
      cortes: 0,
      ultimaCita: `${citaObj.fechaMX} ${citaObj.hora}`,
      estadoCita: citaObj.estado || "Pendiente"
    };
    await setDoc(clienteRef, nuevoCliente);
    return nuevoCliente;
  }
}

export async function obtenerCitasPorFecha(fechaISO) {
  const q = query(collection(db, "citas"), where("fecha", "==", fechaISO));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ firestoreId: d.id, ...d.data() }));
}

export async function obtenerTodasLasCitas() {
  const snap = await getDocs(collection(db, "citas"));
  return snap.docs.map((d) => ({ firestoreId: d.id, ...d.data() }));
}

export async function buscarClientePorCodigo(codigo) {
  const snap = await getDoc(doc(db, "clientes", codigo.toLowerCase()));
  return snap.exists() ? snap.data() : null;
}

export async function actualizarClienteNube(codigo, cambios) {
  const ref = doc(db, "clientes", codigo.toLowerCase());
  await updateDoc(ref, cambios);
}

export async function actualizarCitaNube(firestoreId, cambios) {
  if (!firestoreId) return;
  await updateDoc(doc(db, "citas", firestoreId), cambios);
}

export async function borrarCitaNube(firestoreId) {
  if (!firestoreId) return;
  await deleteDoc(doc(db, "citas", firestoreId));
}

export async function borrarClienteNube(codigo) {
  await deleteDoc(doc(db, "clientes", codigo.toLowerCase()));
}