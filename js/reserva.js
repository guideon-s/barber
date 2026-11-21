import {
  estaDentroDeHorario,
  obtenerCitasPorFecha,
  buscarClientePorCodigo,
  guardarCitaYCliente
} from "./db.js";

const MENSAJE_FUERA_HORARIO =
  "No estamos abiertos a esa hora. Nuestro horario de atención es de 17:00 a 22:00.";

function generarCodigoCliente(nombre = "cl") {
  const prefijo = (nombre.trim().slice(0, 2) || "cl").toLowerCase().replace(/[^a-z]/g, "") || "cl";
  const aleatorio = Math.floor(10000 + Math.random() * 90000);
  return `${prefijo}-${aleatorio}`;
}

function formatearFechaMX(fechaISO) {
  if (!fechaISO || !fechaISO.includes("-")) return fechaISO || "";
  const [anio, mes, dia] = fechaISO.split("-");
  return `${dia}/${mes}/${anio}`;
}

export function mostrarAvisoHorario(elementoAviso, horaStr) {
  if (!elementoAviso) return estaDentroDeHorario(horaStr);
  if (!horaStr) {
    elementoAviso.textContent = "";
    elementoAviso.style.display = "none";
    return false;
  }
  const valido = estaDentroDeHorario(horaStr);
  if (!valido) {
    elementoAviso.textContent = MENSAJE_FUERA_HORARIO;
    elementoAviso.style.display = "block";
  } else {
    elementoAviso.textContent = "";
    elementoAviso.style.display = "none";
  }
  return valido;
}

export async function consultarDisponibilidadReal(fechaISO, horaStr, elementoAviso) {
  const dentro = mostrarAvisoHorario(elementoAviso, horaStr);
  if (!dentro) {
    return {
      disponible: false,
      conEspera: false,
      mensaje: MENSAJE_FUERA_HORARIO,
      citas: []
    };
  }

  if (!fechaISO) {
    return {
      disponible: false,
      conEspera: false,
      mensaje: "Selecciona una fecha para consultar disponibilidad.",
      citas: []
    };
  }

  const citasDelDia = await obtenerCitasPorFecha(fechaISO);
  const citasMismaHora = citasDelDia.filter((c) => c.hora === horaStr);
  const hayCitaReal = citasMismaHora.length > 0;

  return {
    disponible: true,
    conEspera: hayCitaReal,
    mensaje: hayCitaReal
      ? `Ya hay ${citasMismaHora.length} cita(s) registrada(s) a las ${horaStr}. Se marcará con espera.`
      : `Horario disponible a las ${horaStr} (sin citas agendadas en la base de datos).`,
    citas: citasDelDia
  };
}

export function iniciarFormularioReserva({
  formEl,
  inputCodigoExistente,
  btnBuscarCodigo,
  estadoCodigoEl,
  inputNombre,
  inputApellido,
  inputTelefono,
  inputFecha,
  inputHora,
  avisoHorarioEl,
  estadoCitaEl,
  onCitaGuardada
}) {
  let codigoActivo = "";

  if (inputHora) {
    inputHora.addEventListener("change", async () => {
      const hora = inputHora.value;
      const fecha = inputFecha ? inputFecha.value : "";
      const res = await consultarDisponibilidadReal(fecha, hora, avisoHorarioEl);
      if (estadoCitaEl) {
        estadoCitaEl.textContent = res.mensaje;
      }
    });
  }

  if (inputFecha && inputHora) {
    inputFecha.addEventListener("change", async () => {
      if (!inputHora.value) return;
      const res = await consultarDisponibilidadReal(inputFecha.value, inputHora.value, avisoHorarioEl);
      if (estadoCitaEl) {
        estadoCitaEl.textContent = res.mensaje;
      }
    });
  }

  if (btnBuscarCodigo && inputCodigoExistente) {
    btnBuscarCodigo.addEventListener("click", async () => {
      const codigoIngresado = (inputCodigoExistente.value || "").trim().toLowerCase();
      if (!codigoIngresado) {
        if (estadoCodigoEl) estadoCodigoEl.textContent = "Escribe tu código de cliente (ej. jm-91936).";
        return;
      }

      if (estadoCodigoEl) estadoCodigoEl.textContent = "Buscando código en Firestore...";
      try {
        const cliente = await buscarClientePorCodigo(codigoIngresado);
        if (!cliente) {
          codigoActivo = "";
          if (estadoCodigoEl) {
            estadoCodigoEl.textContent = `No se encontró el código "${codigoIngresado}". Puedes escribir tus datos manuales.`;
          }
          return;
        }

        codigoActivo = cliente.codigo || codigoIngresado;
        if (inputNombre) inputNombre.value = cliente.nombre || "";
        if (inputApellido) inputApellido.value = cliente.apellido || "";
        if (inputTelefono) inputTelefono.value = cliente.telefono || "";

        if (estadoCodigoEl) {
          estadoCodigoEl.textContent = `Código ${codigoActivo} cargado: ${cliente.nombre || ""} ${cliente.apellido || ""}`.trim();
        }
      } catch (err) {
        if (estadoCodigoEl) {
          estadoCodigoEl.textContent = `Error al buscar código: ${err.message || err}`;
        }
      }
    });
  }

  if (formEl) {
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();

      const nombre = (inputNombre?.value || "").trim();
      const apellido = (inputApellido?.value || "").trim();
      const telefono = (inputTelefono?.value || "").trim();
      const fecha = (inputFecha?.value || "").trim();
      const hora = (inputHora?.value || "").trim();

      const disponibleRes = await consultarDisponibilidadReal(fecha, hora, avisoHorarioEl);
      if (!disponibleRes.disponible) {
        alert(disponibleRes.mensaje);
        if (estadoCitaEl) estadoCitaEl.textContent = disponibleRes.mensaje;
        return;
      }

      if (!nombre || !telefono || !fecha || !hora) {
        const msg = "Completa nombre, teléfono, fecha y hora.";
        alert(msg);
        if (estadoCitaEl) estadoCitaEl.textContent = msg;
        return;
      }

      const codigoFinal =
        (inputCodigoExistente?.value || "").trim().toLowerCase() ||
        codigoActivo ||
        generarCodigoCliente(nombre);

      const nuevaCita = {
        id: `cita-${Date.now()}`,
        codigo: codigoFinal,
        nombre,
        apellido,
        telefono,
        fecha,
        fechaMX: formatearFechaMX(fecha),
        hora,
        precio: 99,
        moneda: "MXN",
        estado: "Pendiente",
        conEspera: disponibleRes.conEspera
      };

      if (estadoCitaEl) estadoCitaEl.textContent = "Guardando cita en Firestore...";
      try {
        await guardarCitaYCliente(nuevaCita);
        if (estadoCitaEl) {
          estadoCitaEl.textContent = `Cita agendada para ${nombre} el ${nuevaCita.fechaMX} a las ${hora} (Código: ${codigoFinal}).`;
        }
        if (typeof onCitaGuardada === "function") {
          onCitaGuardada(nuevaCita);
        }
      } catch (err) {
        const msgError = `Error al guardar cita: ${err.message || err}`;
        alert(msgError);
        if (estadoCitaEl) estadoCitaEl.textContent = msgError;
      }
    });
  }
}