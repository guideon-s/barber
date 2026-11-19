import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { CONFIG } from "./config.js";

const app = initializeApp(CONFIG.firebase);
const db = getFirestore(app);

const colClientes = collection(db, "clientes");
const colCitas = collection(db, "citas");

export async function obtenerHorasOcupadas(fechaISO) {
  const q = query(colCitas, where("fecha", "==", fechaISO));
  const snap = await getDocs(q);
  const horas = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.hora) horas.push(data.hora);
  });
  return horas;
}

export async function obtenerCodigosExistentes() {
  const snap = await getDocs(colClientes);
  const codigos = [];
  snap.forEach((d) => codigos.push(d.id));
  return codigos;
}

export async function guardarCitaYCliente({ codigo, nombre, apellido, telefono, fecha, hora }) {
  const refCliente = doc(db, "clientes", codigo);
  const snapCliente = await getDoc(refCliente);

  let sellosActuales = 0;
  if (snapCliente.exists()) {
    sellosActuales = snapCliente.data().sellos || 0;
  }

  const datosCliente = {
    codigo,
    nombre,
    apellido,
    telefono,
    sellos: sellosActuales,
    actualizadoEn: new Date().toISOString()
  };

  await setDoc(refCliente, datosCliente, { merge: true });

  const idCita = `${fecha}_${hora.replace(":", "")}`;
  await setDoc(doc(db, "citas", idCita), {
    codigoCliente: codigo,
    nombreCompleto: `${nombre} ${apellido}`,
    telefono,
    fecha,
    hora,
    precio: CONFIG.precioGeneral,
    moneda: CONFIG.moneda,
    estado: "confirmada",
    creadaEn: new Date().toISOString()
  });

  return datosCliente;
}

export async function buscarClientePorCodigo(codigo) {
  const limpio = codigo.trim().toLowerCase();
  const snap = await getDoc(doc(db, "clientes", limpio));
  if (!snap.exists()) return null;
  return snap.data();
}

export async function sumarSelloCliente(codigo) {
  const limpio = codigo.trim().toLowerCase();
  const ref = doc(db, "clientes", limpio);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const actual = snap.data().sellos || 0;
  const meta = CONFIG.metaSellos || 5;
  const nuevoTotal = Math.min(meta, actual + 1);

  await updateDoc(ref, {
    sellos: nuevoTotal,
    actualizadoEn: new Date().toISOString()
  });

  return { ...snap.data(), sellos: nuevoTotal };
}

export async function canjearPremioCliente(codigo) {
  const limpio = codigo.trim().toLowerCase();
  const ref = doc(db, "clientes", limpio);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  await updateDoc(ref, {
    sellos: 0,
    ultimoCanje: new Date().toISOString()
  });

  return { ...snap.data(), sellos: 0 };
}