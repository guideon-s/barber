const DEFAULT_CONFIG = {
  precioGeneral: 99,
  moneda: "MXN",
  metaSellos: 5
};

let CONFIG = { ...DEFAULT_CONFIG };
let obtenerCitasPorFechaFn = null;
let guardarCitaYClienteFn = null;
let buscarClientePorCodigoFn = null;

try {
  const cfgMod = await import("./config.js");
  if (cfgMod?.CONFIG) CONFIG = { ...DEFAULT_CONFIG, ...cfgMod.CONFIG, precioGeneral: 99 };
} catch (_) {}

try {
  const dbMod = await import("./db.js");
  obtenerCitasPorFechaFn = dbMod.obtenerCitasPorFecha || null;
  guardarCitaYClienteFn = dbMod.guardarCitaYCliente || null;
  buscarClientePorCodigoFn = dbMod.buscarClientePorCodigo || null;
} catch (_) {}

const inputNombre = document.getElementById("nombre");
const inputApellido = document.getElementById("apellido");
const inputTelefono = document.getElementById("telefono");
const inputFecha = document.getElementById("fecha");
const inputHora = document.getElementById("hora-manual");
const avisoChoque = document.getElementById("aviso-choque");
const textoChoque = document.getElementById("texto-choque");
const btnEsperarHora = document.getElementById("btn-esperar-hora");
const btnMantenerHora = document.getElementById("btn-mantener-hora");
const btnConfirmar = document.getElementById("btn-confirmar");
const btnLimpiarTicket = document.getElementById("btn-limpiar-qr") || document.getElementById("btn-limpiar-ticket");
const mensajeEstado = document.getElementById("mensaje-estado");
const codigoClienteEl = document.getElementById("codigo-cliente");
const textoSellosEl = document.getElementById("texto-sellos");
const casillasSellosEl = document.getElementById("casillas-sellos");

const voucherEl = document.getElementById("voucher-cita");
const voucherFolioEl = document.getElementById("voucher-folio");
const voucherClienteEl = document.getElementById("voucher-cliente");
const voucherTelefonoEl = document.getElementById("voucher-telefono");
const voucherFechaEl = document.getElementById("voucher-fecha");
const voucherHoraEl = document.getElementById("voucher-hora");
const voucherEstadoEl = document.getElementById("voucher-estado");
const voucherEsperaEl = document.getElementById("voucher-espera");
const voucherTotalEl = document.getElementById("voucher-total");

const DURACION_CORTE_MIN = 60;
const HORA_INICIO_MIN = 17 * 60;
const HORA_FIN_MIN = 22 * 60;
const PRECIO_CITA = 99;
const STORAGE_CITAS = "barber_citas_locales";
const STORAGE_CLIENTES = "barber_clientes_locales";

let citasDelDia = [];
let confirmacionForzadaConEspera = false;
let horaSugeridaEspera = "";

function setEstado(texto) {
  if (mensajeEstado) mensajeEstado.textContent = texto;
}

function leerLocal(clave, fallback = []) {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function escribirLocal(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch (_) {}
}

function isoAMX(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fechaLocalISO(fecha = new Date()) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function guardarCitaLocal(citaObj) {
  const citas = leerLocal(STORAGE_CITAS, []);
  citas.push(citaObj);
  escribirLocal(STORAGE_CITAS, citas);

  const clientes = leerLocal(STORAGE_CLIENTES, []);
  const idx = clientes.findIndex((c) => c.codigo === citaObj.codigo);
  if (idx >= 0) {
    clientes[idx] = {
      ...clientes[idx],
      nombre: citaObj.nombre,
      apellido: citaObj.apellido,
      telefono: citaObj.telefono,
      ultimaCita: `${citaObj.fechaMX} ${citaObj.hora}`,
      estadoCita: citaObj.estado || "Pendiente"
    };
    escribirLocal(STORAGE_CLIENTES, clientes);
    return clientes[idx];
  } else {
    const nuevoCliente = {
      codigo: citaObj.codigo,
      nombre: citaObj.nombre,
      apellido: citaObj.apellido,
      telefono: citaObj.telefono,
      sellos: 0,
      cortes: 0,
      ultimaCita: `${citaObj.fechaMX} ${citaObj.hora}`,
      estadoCita: citaObj.estado || "Pendiente"
    };
    clientes.push(nuevoCliente);
    escribirLocal(STORAGE_CLIENTES, clientes);
    return nuevoCliente;
  }
}

function limpiarFormulario() {
  if (inputNombre) inputNombre.value = "";
  if (inputApellido) inputApellido.value = "";
  if (inputTelefono) inputTelefono.value = "";
  if (inputHora) inputHora.value = "";
}

function limpiarTicket() {
  localStorage.removeItem("barber_codigo");
  localStorage.removeItem("barber_ultimo_ticket");
  if (codigoClienteEl) codigoClienteEl.textContent = "---";
  pintarSellos(0);
  if (voucherEl) voucherEl.style.display = "none";
  setEstado("Ticket y código limpiados. Listo para otro cliente.");
}

function aMinutos(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return NaN;
  const [h, m] = hhmm.split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return NaN;
  return h * 60 + m;
}

function aHHMM(min) {
  const normalizado = ((min % 1440) + 1440) % 1440;
  const h = String(Math.floor(normalizado / 60)).padStart(2, "0");
  const m = String(normalizado % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function generarCodigo(nombre, apellido) {
  const i1 = (nombre.trim()[0] || "c").toLowerCase();
  const i2 = (apellido.trim()[0] || "x").toLowerCase();
  const num = Math.floor(10000 + Math.random() * 90000);
  return `${i1}${i2}-${num}`;
}

function pintarSellos(sellos = 0) {
  if (!casillasSellosEl) return;
  casillasSellosEl.innerHTML = "";
  const meta = CONFIG.metaSellos || 5;
  const total = Math.max(0, Math.min(meta, Number(sellos) || 0));
  for (let i = 1; i <= meta; i++) {
    const span = document.createElement("span");
    span.className = "sello" + (i <= total ? " activo" : "");
    span.textContent = i;
    casillasSellosEl.appendChild(span);
  }
  if (textoSellosEl) {
    textoSellosEl.textContent = `${total} / ${meta} sellos`;
  }
}

function renderizarVoucher({ codigo, nombre, apellido, telefono, fecha, hora, estado, conEspera, precio }) {
  if (!voucherEl) return;
  const monto = precio || PRECIO_CITA;
  voucherFolioEl.textContent = `#${codigo.toUpperCase()}`;
  voucherClienteEl.textContent = `${nombre} ${apellido}`.trim();
  voucherTelefonoEl.textContent = telefono;
  voucherFechaEl.textContent = fecha;
  voucherHoraEl.textContent = hora;
  if (voucherEstadoEl) voucherEstadoEl.textContent = estado || "Pendiente";
  voucherEsperaEl.textContent = conEspera ? "Con espera (cliente previo)" : "Turno normal";
  voucherTotalEl.textContent = `$${monto} ${CONFIG.moneda || "MXN"}`;
  voucherEl.style.display = "block";
}

async function refrescarCitasDia() {
  const iso = (inputFecha?.value || "").trim();
  if (!iso) {
    citasDelDia = [];
    return;
  }

  const locales = leerLocal(STORAGE_CITAS, []).filter((c) => c.fecha === iso);
  let remotas = [];
  if (obtenerCitasPorFechaFn) {
    try {
      remotas = await obtenerCitasPorFechaFn(iso);
    } catch (_) {}
  }
  citasDelDia = [...locales, ...remotas];
}

function evaluarHoraManual() {
  confirmacionForzadaConEspera = false;
  if (avisoChoque) avisoChoque.style.display = "none";
  horaSugeridaEspera = "";

  const horaStr = (inputHora?.value || "").trim();
  if (!horaStr) return false;

  const minElegidos = aMinutos(horaStr);
  if (Number.isNaN(minElegidos)) {
    setEstado("Escribe una hora válida, por ejemplo 17:36.");
    return false;
  }

  if (minElegidos < HORA_INICIO_MIN || minElegidos > HORA_FIN_MIN) {
    setEstado("Estamos disponibles de 17:00 a 22:00.");
    return false;
  }

  const citaCercana = citasDelDia.find((c) => {
    const minCita = aMinutos(c.hora);
    if (Number.isNaN(minCita)) return false;
    return Math.abs(minElegidos - minCita) < DURACION_CORTE_MIN;
  });

  if (citaCercana) {
    const minCita = aMinutos(citaCercana.hora);
    horaSugeridaEspera = aHHMM(minCita + DURACION_CORTE_MIN);
    if (textoChoque) {
      textoChoque.textContent = `Hay una cita a las ${citaCercana.hora}. ¿Quieres esperar como 1 hora máximo (aprox. ${horaSugeridaEspera}) o quieres agendar esa cita que querías (${horaStr}) sabiendo que tendrías que esperar a que termine con mi cliente?`;
    }
    if (avisoChoque) avisoChoque.style.display = "block";
    setEstado("");
    return false;
  }

  setEstado(`Hora disponible: ${horaStr}`);
  return true;
}

async function confirmarCita() {
  const nombre = (inputNombre?.value || "").trim();
  const apellido = (inputApellido?.value || "").trim();
  const telefono = (inputTelefono?.value || "").trim();
  const fechaISO = (inputFecha?.value || "").trim();
  const hora = (inputHora?.value || "").trim();

  if (!nombre || !apellido || !telefono) {
    setEstado("Completa nombre, apellido y teléfono.");
    return;
  }

  if (!fechaISO) {
    setEstado("Selecciona una fecha.");
    return;
  }

  const minElegidos = aMinutos(hora);
  if (!hora || Number.isNaN(minElegidos)) {
    setEstado("Escribe o elige una hora entre 17:00 y 22:00 (Ej. 17:36).");
    return;
  }

  if (minElegidos < HORA_INICIO_MIN || minElegidos > HORA_FIN_MIN) {
    setEstado("Estamos disponibles de 17:00 a 22:00.");
    return;
  }

  await refrescarCitasDia();

  if (!confirmacionForzadaConEspera) {
    const sinChoque = evaluarHoraManual();
    if (!sinChoque) return;
  }

  const conEsperaFinal = confirmacionForzadaConEspera;
  if (btnConfirmar) btnConfirmar.disabled = true;
  setEstado("Registrando cita...");

  try {
    const codigoGuardado = localStorage.getItem("barber_codigo");
    let clienteExistente = null;
    if (codigoGuardado) {
      clienteExistente = leerLocal(STORAGE_CLIENTES, []).find((c) => c.codigo === codigoGuardado) || null;
      if (!clienteExistente && buscarClientePorCodigoFn) {
        try {
          clienteExistente = await buscarClientePorCodigoFn(codigoGuardado);
        } catch (_) {}
      }
    }

    const codigo = clienteExistente ? clienteExistente.codigo : generarCodigo(nombre, apellido);
    const fechaMXStr = isoAMX(fechaISO);

    const payloadCita = {
      id: `cita-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      codigo,
      nombre,
      apellido,
      telefono,
      fecha: fechaISO,
      fechaMX: fechaMXStr,
      hora,
      precio: PRECIO_CITA,
      estado: "Pendiente",
      conEspera: conEsperaFinal
    };

    let clienteResult = guardarCitaLocal(payloadCita);

    if (guardarCitaYClienteFn) {
      try {
        const rem = await guardarCitaYClienteFn(payloadCita);
        if (rem && rem.codigo) clienteResult = { ...clienteResult, ...rem };
      } catch (_) {}
    }

    localStorage.setItem("barber_codigo", clienteResult.codigo);
    const datosTicket = {
      codigo: clienteResult.codigo,
      nombre,
      apellido,
      telefono,
      fecha: fechaMXStr,
      hora,
      estado: "Pendiente",
      conEspera: conEsperaFinal,
      precio: PRECIO_CITA
    };
    localStorage.setItem("barber_ultimo_ticket", JSON.stringify(datosTicket));

    if (codigoClienteEl) codigoClienteEl.textContent = clienteResult.codigo;
    pintarSellos(clienteResult.sellos || 0);
    renderizarVoucher(datosTicket);

    limpiarFormulario();
    if (avisoChoque) avisoChoque.style.display = "none";
    confirmacionForzadaConEspera = false;
    setEstado(`¡Cita registrada (${fechaMXStr} a las ${hora}) en estado Pendiente! Total: $${PRECIO_CITA} MXN.`);
    await refrescarCitasDia();
  } catch (err) {
    console.error(err);
    setEstado("Hubo un detalle al registrar, intenta de nuevo.");
  } finally {
    if (btnConfirmar) btnConfirmar.disabled = false;
  }
}

async function inicializar() {
  pintarSellos(0);

  if (inputFecha && !inputFecha.value) {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    inputFecha.value = fechaLocalISO(manana);
  }

  if (inputFecha) {
    inputFecha.addEventListener("change", async () => {
      await refrescarCitasDia();
      evaluarHoraManual();
    });
  }

  if (inputHora) {
    inputHora.addEventListener("input", evaluarHoraManual);
    inputHora.addEventListener("change", evaluarHoraManual);
  }

  if (btnEsperarHora) {
    btnEsperarHora.addEventListener("click", () => {
      if (!horaSugeridaEspera || !inputHora) return;
      inputHora.value = horaSugeridaEspera;
      confirmacionForzadaConEspera = false;
      if (avisoChoque) avisoChoque.style.display = "none";
      evaluarHoraManual();
    });
  }

  if (btnMantenerHora) {
    btnMantenerHora.addEventListener("click", () => {
      confirmacionForzadaConEspera = true;
      if (avisoChoque) avisoChoque.style.display = "none";
      setEstado(`Listo: se agendará a las ${inputHora?.value} tomando en cuenta que tendrás que esperar a que termine con el cliente.`);
    });
  }

  if (btnLimpiarTicket) {
    btnLimpiarTicket.addEventListener("click", limpiarTicket);
  }

  await refrescarCitasDia();

  const ultimoTicketRaw = localStorage.getItem("barber_ultimo_ticket");
  if (ultimoTicketRaw) {
    try {
      const parsedTicket = JSON.parse(ultimoTicketRaw);
      renderizarVoucher({ ...parsedTicket, precio: 99 });
    } catch (_) {}
  }

  const codigoGuardado = localStorage.getItem("barber_codigo");
  if (codigoGuardado) {
    if (codigoClienteEl) codigoClienteEl.textContent = codigoGuardado;

    const localCli = leerLocal(STORAGE_CLIENTES, []).find((c) => c.codigo === codigoGuardado);
    if (localCli) {
      pintarSellos(localCli.sellos || 0);
    }
    if (buscarClientePorCodigoFn) {
      try {
        const cliente = await buscarClientePorCodigoFn(codigoGuardado);
        if (cliente) {
          if (codigoClienteEl) codigoClienteEl.textContent = cliente.codigo;
          pintarSellos(cliente.sellos || 0);
        }
      } catch (_) {}
    }
  }

  if (btnConfirmar) {
    btnConfirmar.addEventListener("click", confirmarCita);
  }
}

inicializar();