(() => {
  "use strict";

  const STORAGE_KEYS = {
    settings: "apexDispatch.settings.v3",
    recovery: "apexDispatch.recovery.v3",
    shift: "apexDispatch.shift.v3",
    merchantWaits: "apexDispatch.merchantWaits.v3",
  };

  const defaultSettings = {
    language: "en",
    voiceAlerts: true,
    spokenGuidance: true,
    voiceRate: 1,
    avoidTolls: false,
    avoidFerries: true,
    routeAlternatives: true,
    routeRefreshMinutes: 4,
    routesWorkerUrl: "https://api.benlane.us",
    vehicleCost: 0.50,
    minimumPayout: 7,
    targetGrossPerMile: 1.75,
    targetGrossHourly: 25,
    defaultPickupWait: 8,
    defaultDropoffMinutes: 3,
  };

  const defaultRecoveryPoints = [
    {
      id: "red-cliffs-core-east",
      name: "Red Cliffs Core East",
      address: "1770 Red Cliffs Dr, St. George, UT 84790",
      parking: "Use a marked stall in the east perimeter row. Stay clear of loading areas and fire lanes.",
      preferred: true,
      active: true,
    },
    {
      id: "downtown-core-west",
      name: "Downtown Core West",
      address: "50 S Main St, St. George, UT 84770",
      parking: "Use a marked public stall on the west side of the square. Verify posted time limits before waiting.",
      preferred: false,
      active: true,
    },
    {
      id: "central-south-east",
      name: "Central South East",
      address: "300 S 400 E, St. George, UT 84770",
      parking: "Use a marked stall on the east side of the park. Do not stop along curbs, gates, or fire lanes.",
      preferred: false,
      active: true,
    },
    {
      id: "washington-east-core",
      name: "Washington East Core",
      address: "350 N Community Center Dr, Washington, UT 84780",
      parking: "Use a marked stall in the north parking row. Verify event restrictions before waiting.",
      preferred: false,
      active: true,
    },
  ];

  const defaultShift = {
    state: "off",
    startedAt: null,
    endedAt: null,
    breakStartedAt: null,
    totalBreakMs: 0,
    logs: [],
    activeOffer: null,
  };

  const translations = {
    en: {
      brandEyebrow: "Route intelligence", language: "Language", routeUnchecked: "Route service unchecked", routeOnline: "Route service online", routeOffline: "Route service unavailable",
      shiftOff: "Shift off", shiftActive: "Shift active", shiftBreak: "On break", install: "Install", dispatchTab: "Dispatch", shiftTab: "Shift", recoveryTab: "Recovery", settingsTab: "Settings",
      decisionSupport: "Decision support only.", decisionSupportDetail: "The driver controls the vehicle and the connected delivery platform. Apex calculates the route, profitability, alerts, and exact recovery point.",
      incomingOffer: "Incoming offer", threeInputs: "Three inputs. Apex calculates the rest.", reset: "Reset", payoutLabel: "Offer payout", pickupLabel: "Pickup location", dropoffLabel: "Drop-off location",
      pickupPlaceholder: "Business name or full address", dropoffPlaceholder: "Full destination address", startingPoint: "Starting point", gpsNotSet: "Current position not set", useCurrentPosition: "Use current position", enterAddress: "Enter address", useGpsInstead: "Use GPS instead", startingAddress: "Starting address", startingPlaceholder: "Full starting address", analyzeOffer: "Analyze offer", readyForInputs: "Enter the offer and use your current position.",
      recommendation: "Recommendation", waiting: "WAITING", noRoute: "No route", decisionEmpty: "Apex will calculate traffic-adjusted mileage, timing, profitability, and the exact recovery point.", totalMiles: "Total miles", totalTime: "Total time", trafficDelay: "Traffic delay", grossPerMile: "Gross / mile", grossPerHour: "Gross / hour", deliveryEta: "Delivery ETA",
      exactRecovery: "Exact recovery point", notCalculated: "Not calculated", recoveryPending: "Apex will select the fastest active recovery point.", toPickup: "To pickup", toDropoff: "To drop-off", toRecovery: "To recovery",
      voiceGuidance: "Apex Voice", guidanceIdle: "Guidance is idle", stopVoice: "Stop voice", guidePickup: "Guide to pickup", guideDropoff: "Guide to drop-off", guideRecovery: "Guide to recovery", foregroundGuidance: "Keep Apex open and location access active during spoken guidance.", acceptStart: "Accept & start", logDecline: "Log decline", refreshRoute: "Refresh",
      shiftControl: "Shift control", operationStatus: "Operation status", startShift: "Start shift", startBreak: "Start break", endBreak: "End break", endShift: "End shift", activeDelivery: "Active delivery", completeDelivery: "Complete delivery", elapsed: "Elapsed", grossEarnings: "Gross earnings", operationalMiles: "Operational miles", vehicleCost: "Vehicle cost", estimatedNet: "Estimated net", grossActiveHour: "Gross / active hour",
      shiftLog: "Shift log", automaticRecords: "Automatic records", exportCsv: "Export CSV", time: "Time", status: "Status", pickup: "Pickup", payout: "Payout", miles: "Miles", minutes: "Minutes", recovery: "Recovery", noRecords: "No records yet.", clearShift: "Clear shift data",
      recoveryNetwork: "Recovery network", exactWaitingSpots: "Exact waiting spots", recoveryExplanation: "Apex compares every active point and selects the fastest exact location after each delivery.", addRecovery: "Add recovery point", saveExactSpot: "Save an exact stop", spotName: "Spot name", spotNamePlaceholder: "Red Cliffs Core East", fullAddress: "Full address", fullAddressPlaceholder: "Street, city, state, ZIP", parkingInstruction: "Exact parking instruction", parkingPlaceholder: "Park in the east perimeter row, marked stalls only", preferredPoint: "Preferred when travel times are close", activePoint: "Active recovery point", noCoordinates: "No exact coordinates saved.", saveCurrentSpot: "Use current position", saveRecoveryPoint: "Save recovery point", cancel: "Cancel", safety: "Safety:", parkingSafety: "Save only legal, well-lit parking locations. Never use a fire lane, loading zone, or private restricted stall.",
      navigationPreferences: "Navigation preferences", voiceAndRoutes: "Voice and routes", interfaceLanguage: "Interface language", voiceRate: "Voice speed", voiceAlerts: "Speak alerts and recommendations", spokenGuidance: "Enable spoken route guidance", avoidTolls: "Avoid toll roads", avoidFerries: "Avoid ferries", routeAlternatives: "Calculate alternate routes", staleMinutes: "Refresh warning after minutes", routingServiceUrl: "Apex Routing Service URL", saveSettings: "Save settings", testService: "Test service", notTested: "Not tested.", operatingModel: "Operating model", automaticAssumptions: "Automatic assumptions", vehicleCostPerMile: "Vehicle cost per mile", minimumPayout: "Minimum payout", targetPerMile: "Target gross per mile", targetHourly: "Target gross per hour", defaultPickupWait: "Default pickup wait", defaultDropoffTime: "Default drop-off service time", saveOperatingModel: "Save operating model", automaticEstimateNote: "These values are defaults. Apex uses saved merchant history when available and never asks the driver to estimate route time or mileage.", footerStatement: "Controlled decision support. Driver authority remains final.",
      edit: "Edit", delete: "Delete", preferred: "Preferred", inactive: "Inactive", exactGps: "Exact GPS", addressBased: "Address-based", currentPositionSet: "Current position set", addressOrigin: "Starting address entered",
      calculatingRecovery: "Comparing exact recovery points…", calculatingRoute: "Calculating traffic, mileage, ETA, and profitability…", routeReady: "Analysis complete. Exact recovery point selected.", serviceMissing: "Set the Apex Routing Service URL in Settings.", needOrigin: "Use current position or enter a starting address.", needFields: "Enter payout, pickup, and drop-off.", noRecoveryPoints: "At least one active recovery point is required.", locationDenied: "Location access failed. Enter a starting address or check device permissions.", locationSaved: "Exact position saved.", settingsSaved: "Settings saved.", pointSaved: "Recovery point saved.", pointDeleted: "Recovery point deleted.", confirmDeletePoint: "Delete this recovery point?", confirmClearShift: "Clear all shift records and timers?",
      accept: "ACCEPT", maybe: "MAYBE", decline: "DECLINE", acceptSummary: "Strong route economics based on live mileage and time.", maybeSummary: "Borderline route economics. Review the alerts before accepting.", declineSummary: "The route does not meet the current operating thresholds.",
      trafficAlert: "Traffic adds about {minutes} minutes.", recoveryAlert: "Recovery requires {minutes} minutes after drop-off.", mileageAlert: "Gross per mile is below the target.", hourlyAlert: "Projected gross per hour is below the target.", lowPayoutAlert: "Payout is below the minimum.", routeFresh: "Current", routeStale: "Refresh needed", routeStaleAlert: "Route data is stale. Refresh before relying on the ETA.",
      recoveryEtaText: "Arrive about {time} · {miles} mi · {minutes} min", legMetric: "{miles} mi · {minutes} min", totalTimeValue: "{minutes} min", trafficValue: "+{minutes} min",
      voiceAccept: "Accept. {miles} total miles and about {minutes} minutes. Recover at {name}, {address}. {parking}", voiceMaybe: "Maybe. Review the alerts. {miles} total miles and about {minutes} minutes. Recovery is {name}, {address}. {parking}", voiceDecline: "Decline. The route does not meet the operating thresholds.",
      guidanceStarting: "Starting guidance to {destination}.", guidanceActive: "Guidance to {destination}", guidanceArrived: "You have arrived at {destination}.", guidanceUnavailable: "Spoken guidance is unavailable for this route.", guidanceOff: "Spoken guidance is disabled in Settings.", guidanceStopped: "Guidance stopped.", inDistance: "In {distance}, {instruction}", continueInstruction: "Continue on the current road.", locationLost: "Location signal is unavailable. Keep Apex open and check location permissions.",
      serviceOnline: "Service online.", serviceNotConfigured: "Service is online but the route key is not configured.", serviceTestFailed: "Service test failed.", activeStarted: "Offer accepted. Delivery timer started.", completed: "Delivery completed and logged.", declinedLogged: "Decline logged.", shiftStarted: "Shift started.", breakStarted: "Break started.", breakEnded: "Break ended.", shiftEnded: "Shift ended.",
      completedStatus: "Completed", declinedStatus: "Declined", acceptedStatus: "Accepted", exactCoordinates: "Coordinates: {lat}, {lng}", noAddressOrGps: "Enter a full address or save the current position.", noVoiceSupport: "Voice is not supported on this device.", routeServiceError: "Route calculation failed: {message}",
    },
    "es-NI": {
      brandEyebrow: "Inteligencia de rutas", language: "Idioma", routeUnchecked: "Servicio de rutas sin verificar", routeOnline: "Servicio de rutas activo", routeOffline: "Servicio de rutas no disponible",
      shiftOff: "Turno apagado", shiftActive: "Turno activo", shiftBreak: "En descanso", install: "Instalar", dispatchTab: "Despacho", shiftTab: "Turno", recoveryTab: "Recuperación", settingsTab: "Ajustes",
      decisionSupport: "Solo apoyo para decidir.", decisionSupportDetail: "La persona que maneja controla el vehículo y la plataforma conectada. Apex calcula la ruta, rentabilidad, alertas y el punto exacto de recuperación.",
      incomingOffer: "Oferta entrante", threeInputs: "Tres datos. Apex calcula lo demás.", reset: "Limpiar", payoutLabel: "Pago de la oferta", pickupLabel: "Punto de recogida", dropoffLabel: "Punto de entrega",
      pickupPlaceholder: "Nombre del negocio o dirección completa", dropoffPlaceholder: "Dirección completa del destino", startingPoint: "Punto de salida", gpsNotSet: "Ubicación actual no definida", useCurrentPosition: "Usar ubicación actual", enterAddress: "Escribir dirección", useGpsInstead: "Usar GPS", startingAddress: "Dirección de salida", startingPlaceholder: "Dirección completa de salida", analyzeOffer: "Analizar oferta", readyForInputs: "Ingresá la oferta y usá tu ubicación actual.",
      recommendation: "Recomendación", waiting: "ESPERANDO", noRoute: "Sin ruta", decisionEmpty: "Apex calculará millas, tiempo con tráfico, rentabilidad y el punto exacto de recuperación.", totalMiles: "Millas totales", totalTime: "Tiempo total", trafficDelay: "Demora por tráfico", grossPerMile: "Bruto / milla", grossPerHour: "Bruto / hora", deliveryEta: "Hora de entrega",
      exactRecovery: "Punto exacto de recuperación", notCalculated: "Sin calcular", recoveryPending: "Apex elegirá el punto activo más rápido.", toPickup: "Hacia recogida", toDropoff: "Hacia entrega", toRecovery: "Hacia recuperación",
      voiceGuidance: "Voz de Apex", guidanceIdle: "Guía inactiva", stopVoice: "Detener voz", guidePickup: "Guiar a recogida", guideDropoff: "Guiar a entrega", guideRecovery: "Guiar a recuperación", foregroundGuidance: "Mantené Apex abierto y el acceso a ubicación activo durante la guía hablada.", acceptStart: "Aceptar e iniciar", logDecline: "Registrar rechazo", refreshRoute: "Actualizar",
      shiftControl: "Control del turno", operationStatus: "Estado de operación", startShift: "Iniciar turno", startBreak: "Iniciar descanso", endBreak: "Terminar descanso", endShift: "Terminar turno", activeDelivery: "Entrega activa", completeDelivery: "Completar entrega", elapsed: "Transcurrido", grossEarnings: "Ingreso bruto", operationalMiles: "Millas operativas", vehicleCost: "Costo del vehículo", estimatedNet: "Neto estimado", grossActiveHour: "Bruto / hora activa",
      shiftLog: "Registro del turno", automaticRecords: "Registros automáticos", exportCsv: "Exportar CSV", time: "Hora", status: "Estado", pickup: "Recogida", payout: "Pago", miles: "Millas", minutes: "Minutos", recovery: "Recuperación", noRecords: "Todavía no hay registros.", clearShift: "Borrar datos del turno",
      recoveryNetwork: "Red de recuperación", exactWaitingSpots: "Puntos exactos de espera", recoveryExplanation: "Apex compara cada punto activo y elige la ubicación exacta más rápida después de cada entrega.", addRecovery: "Agregar punto", saveExactSpot: "Guardar parada exacta", spotName: "Nombre del punto", spotNamePlaceholder: "Núcleo Red Cliffs Este", fullAddress: "Dirección completa", fullAddressPlaceholder: "Calle, ciudad, estado y código postal", parkingInstruction: "Instrucción exacta para estacionar", parkingPlaceholder: "Estacionate en la fila este, solo en espacios marcados", preferredPoint: "Preferido cuando los tiempos sean parecidos", activePoint: "Punto de recuperación activo", noCoordinates: "No hay coordenadas exactas guardadas.", saveCurrentSpot: "Usar ubicación actual", saveRecoveryPoint: "Guardar punto", cancel: "Cancelar", safety: "Seguridad:", parkingSafety: "Guardá solamente lugares legales, iluminados y seguros. Nunca usés carriles de bomberos, zonas de carga ni espacios privados restringidos.",
      navigationPreferences: "Preferencias de navegación", voiceAndRoutes: "Voz y rutas", interfaceLanguage: "Idioma de la interfaz", voiceRate: "Velocidad de voz", voiceAlerts: "Leer alertas y recomendaciones", spokenGuidance: "Activar guía hablada", avoidTolls: "Evitar carreteras con peaje", avoidFerries: "Evitar ferris", routeAlternatives: "Calcular rutas alternas", staleMinutes: "Avisar para actualizar después de minutos", routingServiceUrl: "URL del Servicio de Rutas Apex", saveSettings: "Guardar ajustes", testService: "Probar servicio", notTested: "Sin probar.", operatingModel: "Modelo operativo", automaticAssumptions: "Supuestos automáticos", vehicleCostPerMile: "Costo del vehículo por milla", minimumPayout: "Pago mínimo", targetPerMile: "Meta bruta por milla", targetHourly: "Meta bruta por hora", defaultPickupWait: "Espera predeterminada en recogida", defaultDropoffTime: "Tiempo predeterminado para entregar", saveOperatingModel: "Guardar modelo operativo", automaticEstimateNote: "Estos valores son predeterminados. Apex usa el historial guardado cuando existe y nunca le pide a la persona que maneja estimar tiempo o millas.", footerStatement: "Apoyo controlado para decidir. La autoridad final es de quien maneja.",
      edit: "Editar", delete: "Borrar", preferred: "Preferido", inactive: "Inactivo", exactGps: "GPS exacto", addressBased: "Por dirección", currentPositionSet: "Ubicación actual definida", addressOrigin: "Dirección de salida ingresada",
      calculatingRecovery: "Comparando puntos exactos de recuperación…", calculatingRoute: "Calculando tráfico, millas, llegada y rentabilidad…", routeReady: "Análisis listo. Punto exacto de recuperación seleccionado.", serviceMissing: "Configurá la URL del Servicio de Rutas Apex en Ajustes.", needOrigin: "Usá la ubicación actual o ingresá una dirección de salida.", needFields: "Ingresá pago, recogida y entrega.", noRecoveryPoints: "Se necesita por lo menos un punto de recuperación activo.", locationDenied: "No se pudo obtener la ubicación. Ingresá una dirección o revisá los permisos.", locationSaved: "Ubicación exacta guardada.", settingsSaved: "Ajustes guardados.", pointSaved: "Punto de recuperación guardado.", pointDeleted: "Punto de recuperación borrado.", confirmDeletePoint: "¿Borrar este punto de recuperación?", confirmClearShift: "¿Borrar todos los registros y tiempos del turno?",
      accept: "ACEPTAR", maybe: "QUIZÁS", decline: "RECHAZAR", acceptSummary: "Buena rentabilidad según millas y tiempo actuales.", maybeSummary: "Rentabilidad al límite. Revisá las alertas antes de aceptar.", declineSummary: "La ruta no cumple las metas operativas actuales.",
      trafficAlert: "El tráfico agrega aproximadamente {minutes} minutos.", recoveryAlert: "La recuperación requiere {minutes} minutos después de entregar.", mileageAlert: "El bruto por milla está por debajo de la meta.", hourlyAlert: "El bruto por hora proyectado está por debajo de la meta.", lowPayoutAlert: "El pago está por debajo del mínimo.", routeFresh: "Actual", routeStale: "Necesita actualizar", routeStaleAlert: "La ruta está desactualizada. Actualizala antes de confiar en la hora de llegada.",
      recoveryEtaText: "Llegada aproximada {time} · {miles} mi · {minutes} min", legMetric: "{miles} mi · {minutes} min", totalTimeValue: "{minutes} min", trafficValue: "+{minutes} min",
      voiceAccept: "Aceptá. {miles} millas totales y aproximadamente {minutes} minutos. Recuperate en {name}, {address}. {parking}", voiceMaybe: "Quizás. Revisá las alertas. {miles} millas totales y aproximadamente {minutes} minutos. Recuperate en {name}, {address}. {parking}", voiceDecline: "Rechazá. La ruta no cumple las metas operativas.",
      guidanceStarting: "Iniciando guía hacia {destination}.", guidanceActive: "Guía hacia {destination}", guidanceArrived: "Llegaste a {destination}.", guidanceUnavailable: "No hay instrucciones habladas disponibles para esta ruta.", guidanceOff: "La guía hablada está desactivada en Ajustes.", guidanceStopped: "Guía detenida.", inDistance: "En {distance}, {instruction}", continueInstruction: "Continuá por la vía actual.", locationLost: "No hay señal de ubicación. Mantené Apex abierto y revisá los permisos.",
      serviceOnline: "Servicio activo.", serviceNotConfigured: "El servicio está activo, pero la clave de rutas no está configurada.", serviceTestFailed: "Falló la prueba del servicio.", activeStarted: "Oferta aceptada. Temporizador iniciado.", completed: "Entrega completada y registrada.", declinedLogged: "Rechazo registrado.", shiftStarted: "Turno iniciado.", breakStarted: "Descanso iniciado.", breakEnded: "Descanso terminado.", shiftEnded: "Turno terminado.",
      completedStatus: "Completada", declinedStatus: "Rechazada", acceptedStatus: "Aceptada", exactCoordinates: "Coordenadas: {lat}, {lng}", noAddressOrGps: "Ingresá una dirección completa o guardá la ubicación actual.", noVoiceSupport: "Este dispositivo no admite voz.", routeServiceError: "Falló el cálculo de la ruta: {message}",
    },
  };

  const routeState = {
    currentPosition: null,
    currentPositionAt: null,
    useGpsOrigin: false,
    plan: null,
    selectedRecovery: null,
    dirty: false,
    calculating: false,
    staleAlertSpoken: false,
  };

  const guidanceState = {
    watchId: null,
    active: false,
    legKey: null,
    destination: "",
    steps: [],
    stepIndex: 0,
    approachSpoken: false,
    lastPositionAt: 0,
  };

  const clone = (value) => typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));

  let settings = loadJson(STORAGE_KEYS.settings, defaultSettings);
  let recoveryPoints = loadJson(STORAGE_KEYS.recovery, defaultRecoveryPoints);
  let shift = loadJson(STORAGE_KEYS.shift, defaultShift);
  let merchantWaits = loadJson(STORAGE_KEYS.merchantWaits, {});
  let lastAnalysis = null;
  let deferredInstallPrompt = null;
  let recoveryEditCoordinates = null;

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const money = (value) => new Intl.NumberFormat(settings.language === "es-NI" ? "es-NI" : "en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
  const oneDecimal = (value) => Number(value || 0).toFixed(1);
  const routeWorkerBase = () => String(settings.routesWorkerUrl || "").trim().replace(/\/+$/, "");

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return clone(fallback);
      const parsed = JSON.parse(raw);
      if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : clone(fallback);
      return { ...clone(fallback), ...parsed };
    } catch {
      return clone(fallback);
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function t(key, vars = {}) {
    const dictionary = translations[settings.language] || translations.en;
    let text = dictionary[key] ?? translations.en[key] ?? key;
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  }

  function applyLanguage() {
    document.documentElement.lang = settings.language === "es-NI" ? "es-NI" : "en";
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
    $("languageSelect").value = settings.language;
    $("settingsLanguage").value = settings.language;
    renderShift();
    renderRecoveryPoints();
    if (lastAnalysis) renderAnalysis(lastAnalysis, { speak: false });
    else resetResultView();
    renderOriginSummary();
    renderGuidanceStatus();
  }

  function readNumber(id, fallback = 0) {
    const value = Number($(id)?.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function formatClock(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat(settings.language === "es-NI" ? "es-NI" : "en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
  }

  function formatDuration(ms) {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function setStatus(message, tone = "neutral") {
    $("routeStatusMessage").textContent = message;
    $("routeStatusMessage").className = `route-status ${tone}`;
  }

  function setServiceStatus(text, tone) {
    $("routeApiStatus").textContent = text;
    $("routeApiStatus").className = `status-pill ${tone === "good" ? "status-on" : "status-off"}`;
  }

  function renderOriginSummary() {
    if (routeState.useGpsOrigin && routeState.currentPosition) {
      $("originSummary").textContent = `${t("currentPositionSet")} · ${routeState.currentPosition.latitude.toFixed(5)}, ${routeState.currentPosition.longitude.toFixed(5)}`;
      return;
    }
    if ($("originAddress").value.trim()) {
      $("originSummary").textContent = `${t("addressOrigin")} · ${$("originAddress").value.trim()}`;
      return;
    }
    $("originSummary").textContent = t("gpsNotSet");
  }

  function pointForOrigin() {
    if (routeState.useGpsOrigin && routeState.currentPosition) return { ...routeState.currentPosition };
    const address = $("originAddress").value.trim();
    return address ? { address } : null;
  }

  function pointForRecovery(point) {
    if (Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))) {
      return { latitude: Number(point.latitude), longitude: Number(point.longitude) };
    }
    return point.address ? { address: point.address } : null;
  }

  function routeOptions() {
    return {
      routingPreference: "TRAFFIC_AWARE_OPTIMAL",
      trafficModel: "BEST_GUESS",
      alternatives: Boolean(settings.routeAlternatives),
      avoidTolls: Boolean(settings.avoidTolls),
      avoidHighways: false,
      avoidFerries: Boolean(settings.avoidFerries),
      includeTrafficPolyline: false,
      languageCode: settings.language === "es-NI" ? "es-419" : "en-US",
    };
  }

  async function apiRequest(path, payload) {
    const base = routeWorkerBase();
    if (!base) throw new Error(t("serviceMissing"));
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
    return body;
  }

  async function getCurrentPosition(options = {}) {
    if (!navigator.geolocation) throw new Error(t("locationDenied"));
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
        () => reject(new Error(t("locationDenied"))),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: options.fresh ? 0 : 30000 },
      );
    });
  }

  async function useCurrentLocationForOrigin() {
    try {
      setStatus(t("calculatingRoute"), "neutral");
      const position = await getCurrentPosition({ fresh: true });
      routeState.currentPosition = { latitude: position.latitude, longitude: position.longitude };
      routeState.currentPositionAt = Date.now();
      routeState.useGpsOrigin = true;
      $("originAddress").value = "";
      $("originAddressWrap").hidden = true;
      $("toggleOriginAddress").textContent = t("enterAddress");
      markRouteDirty();
      renderOriginSummary();
      setStatus(t("locationSaved"), "good");
    } catch (error) {
      setStatus(error.message, "bad");
      notify(error.message, "bad", true);
    }
  }

  function toggleOriginAddress() {
    const wrap = $("originAddressWrap");
    wrap.hidden = !wrap.hidden;
    if (!wrap.hidden) {
      routeState.useGpsOrigin = false;
      $("originAddress").focus();
      $("toggleOriginAddress").textContent = t("useGpsInstead");
    } else {
      $("toggleOriginAddress").textContent = t("enterAddress");
    }
    renderOriginSummary();
    markRouteDirty();
  }

  function activeRecoveryPoints() {
    return recoveryPoints.filter((point) => point.active && pointForRecovery(point));
  }

  async function selectRecoveryPoint(dropoff) {
    const points = activeRecoveryPoints();
    if (!points.length) throw new Error(t("noRecoveryPoints"));
    setStatus(t("calculatingRecovery"), "neutral");

    const matrix = await apiRequest("/route-matrix", {
      origin: dropoff,
      destinations: points.map((point) => ({ point: pointForRecovery(point), label: point.name })),
      options: routeOptions(),
    });

    const existing = (matrix.results || []).filter((row) => row.condition === "ROUTE_EXISTS" && Number(row.durationSeconds) > 0);
    if (!existing.length) return points[0];
    const fastest = existing[0];
    const preferredWithinWindow = existing.find((row) => points[row.destinationIndex]?.preferred && row.durationSeconds <= fastest.durationSeconds + 180);
    const chosen = preferredWithinWindow || fastest;
    const point = points[chosen.destinationIndex] || points[0];
    return { ...point, matrix: chosen };
  }

  function getPickupWait(pickupText) {
    const normalized = pickupText.trim().toLowerCase();
    const matching = Object.entries(merchantWaits).find(([key]) => normalized.includes(key) || key.includes(normalized));
    return matching ? Number(matching[1].averageMinutes || settings.defaultPickupWait) : Number(settings.defaultPickupWait);
  }

  async function analyzeOffer() {
    if (routeState.calculating) return;
    const payout = readNumber("payout");
    const pickupText = $("pickupAddress").value.trim();
    const dropoffText = $("dropoffAddress").value.trim();
    const origin = pointForOrigin();

    if (!payout || !pickupText || !dropoffText) {
      setStatus(t("needFields"), "bad");
      notify(t("needFields"), "bad", true);
      return;
    }
    if (!origin) {
      setStatus(t("needOrigin"), "bad");
      notify(t("needOrigin"), "bad", true);
      return;
    }

    routeState.calculating = true;
    $("analyzeOffer").disabled = true;
    $("refreshRoute").disabled = true;
    clearAlerts();

    try {
      const pickup = { address: pickupText };
      const dropoff = { address: dropoffText };
      const recovery = await selectRecoveryPoint(dropoff);
      routeState.selectedRecovery = recovery;
      setStatus(t("calculatingRoute"), "neutral");

      const plan = await apiRequest("/route-plan", {
        origin,
        pickup,
        dropoff,
        recovery: pointForRecovery(recovery),
        pickupWaitMinutes: getPickupWait(pickupText),
        dropoffMinutes: Number(settings.defaultDropoffMinutes),
        options: routeOptions(),
      });

      routeState.plan = plan;
      routeState.dirty = false;
      routeState.staleAlertSpoken = false;
      lastAnalysis = evaluateOffer({ payout, pickupText, dropoffText, plan, recovery });
      renderAnalysis(lastAnalysis, { speak: true });
      setStatus(t("routeReady"), "good");
    } catch (error) {
      const message = t("routeServiceError", { message: error.message });
      setStatus(message, "bad");
      notify(message, "bad", true);
      setServiceStatus(t("routeOffline"), "bad");
    } finally {
      routeState.calculating = false;
      $("analyzeOffer").disabled = false;
      $("refreshRoute").disabled = !lastAnalysis;
    }
  }

  function defaultRoute(leg) {
    return leg?.routes?.find((route) => route.isDefault) || leg?.routes?.[0] || null;
  }

  function evaluateOffer({ payout, pickupText, dropoffText, plan, recovery }) {
    const totalMiles = Math.max(0.1, Number(plan.totals?.miles || 0));
    const routeMinutes = Number(plan.totals?.minutes || 0);
    const pickupWait = Number(plan.schedule?.pickupWaitMinutes || settings.defaultPickupWait);
    const dropoffMinutes = Number(plan.schedule?.dropoffMinutes || settings.defaultDropoffMinutes);
    const totalMinutes = Math.max(1, routeMinutes + pickupWait + dropoffMinutes);
    const vehicleCost = totalMiles * Number(settings.vehicleCost);
    const net = payout - vehicleCost;
    const grossPerMile = payout / totalMiles;
    const grossHourly = payout / (totalMinutes / 60);
    const recoveryRoute = defaultRoute(plan.legs?.toRecovery);
    const recoveryMinutes = Number(recoveryRoute?.minutes || 0);
    const trafficDelay = Number(plan.totals?.trafficDelayMinutes || 0);
    const targetPerMile = Number(settings.targetGrossPerMile) + (recoveryMinutes > 12 ? 0.35 : recoveryMinutes > 8 ? 0.15 : 0);

    let score = 50;
    score += clamp((grossPerMile - targetPerMile) * 18, -32, 30);
    score += clamp((grossHourly - Number(settings.targetGrossHourly)) * 1.5, -26, 24);
    score += clamp((payout - Number(settings.minimumPayout)) * 2, -16, 16);
    score -= clamp(trafficDelay * 0.9, 0, 12);
    score -= clamp((recoveryMinutes - 8) * 1.1, 0, 14);
    score = Math.round(clamp(score, 0, 100));

    const hardDecline = payout < Number(settings.minimumPayout) - 1.5 || grossPerMile < targetPerMile * 0.72 || net <= 2;
    let verdict = "MAYBE";
    if (hardDecline || score < 47) verdict = "DECLINE";
    else if (score >= 68 && grossPerMile >= targetPerMile && grossHourly >= Number(settings.targetGrossHourly)) verdict = "ACCEPT";

    const alerts = [];
    if (trafficDelay >= 3) alerts.push({ tone: trafficDelay >= 8 ? "bad" : "warn", text: t("trafficAlert", { minutes: oneDecimal(trafficDelay) }) });
    if (recoveryMinutes >= 8) alerts.push({ tone: recoveryMinutes >= 14 ? "bad" : "warn", text: t("recoveryAlert", { minutes: oneDecimal(recoveryMinutes) }) });
    if (grossPerMile < targetPerMile) alerts.push({ tone: "warn", text: t("mileageAlert") });
    if (grossHourly < Number(settings.targetGrossHourly)) alerts.push({ tone: "warn", text: t("hourlyAlert") });
    if (payout < Number(settings.minimumPayout)) alerts.push({ tone: "bad", text: t("lowPayoutAlert") });

    return {
      payout,
      pickupText,
      dropoffText,
      recovery,
      plan,
      totalMiles,
      routeMinutes,
      pickupWait,
      dropoffMinutes,
      totalMinutes,
      vehicleCost,
      net,
      grossPerMile,
      grossHourly,
      trafficDelay,
      recoveryMinutes,
      score,
      verdict,
      alerts,
      computedAt: plan.computedAt,
    };
  }

  function renderAnalysis(analysis, options = {}) {
    const verdictClass = { ACCEPT: "verdict-accept", MAYBE: "verdict-maybe", DECLINE: "verdict-decline" }[analysis.verdict] || "verdict-neutral";
    const verdictKey = { ACCEPT: "accept", MAYBE: "maybe", DECLINE: "decline" }[analysis.verdict];
    const summaryKey = { ACCEPT: "acceptSummary", MAYBE: "maybeSummary", DECLINE: "declineSummary" }[analysis.verdict];
    $("verdictBadge").className = `verdict ${verdictClass}`;
    $("verdictBadge").textContent = t(verdictKey);
    $("decisionSummary").textContent = t(summaryKey);
    $("totalMilesMetric").textContent = `${oneDecimal(analysis.totalMiles)} mi`;
    $("totalTimeMetric").textContent = t("totalTimeValue", { minutes: Math.ceil(analysis.totalMinutes) });
    $("trafficDelayMetric").textContent = t("trafficValue", { minutes: oneDecimal(analysis.trafficDelay) });
    $("grossPerMileMetric").textContent = money(analysis.grossPerMile);
    $("grossHourlyMetric").textContent = money(analysis.grossHourly);
    $("deliveryEtaMetric").textContent = formatClock(analysis.plan.totals?.deliveryEta);

    $("recoveryName").textContent = analysis.recovery.name;
    $("recoveryAddress").textContent = analysis.recovery.address || `${Number(analysis.recovery.latitude).toFixed(6)}, ${Number(analysis.recovery.longitude).toFixed(6)}`;
    $("recoveryParking").textContent = analysis.recovery.parking;
    const recoveryRoute = defaultRoute(analysis.plan.legs?.toRecovery);
    $("recoveryEta").textContent = t("recoveryEtaText", {
      time: formatClock(analysis.plan.totals?.recoveryEta),
      miles: oneDecimal(recoveryRoute?.miles || 0),
      minutes: Math.ceil(recoveryRoute?.minutes || 0),
    });

    const pickupRoute = defaultRoute(analysis.plan.legs?.toPickup);
    const dropoffRoute = defaultRoute(analysis.plan.legs?.toDropoff);
    $("toPickupMetric").textContent = t("legMetric", { miles: oneDecimal(pickupRoute?.miles || 0), minutes: Math.ceil(pickupRoute?.minutes || 0) });
    $("toDropoffMetric").textContent = t("legMetric", { miles: oneDecimal(dropoffRoute?.miles || 0), minutes: Math.ceil(dropoffRoute?.minutes || 0) });
    $("toRecoveryMetric").textContent = t("legMetric", { miles: oneDecimal(recoveryRoute?.miles || 0), minutes: Math.ceil(recoveryRoute?.minutes || 0) });
    $("routeLegs").hidden = false;

    clearAlerts();
    analysis.alerts.forEach((alert) => addAlert(alert.text, alert.tone));
    renderFreshness();

    const hasPickupSteps = Boolean(pickupRoute?.steps?.length);
    const hasDropoffSteps = Boolean(dropoffRoute?.steps?.length);
    const hasRecoverySteps = Boolean(recoveryRoute?.steps?.length);
    $("guidePickup").disabled = !hasPickupSteps;
    $("guideDropoff").disabled = !hasDropoffSteps;
    $("guideRecovery").disabled = !hasRecoverySteps;
    $("acceptOffer").disabled = false;
    $("declineOffer").disabled = false;
    $("refreshRoute").disabled = false;

    if (options.speak && settings.voiceAlerts) speakAnalysis(analysis);
  }

  function resetResultView() {
    $("verdictBadge").className = "verdict verdict-neutral";
    $("verdictBadge").textContent = t("waiting");
    $("decisionSummary").textContent = t("decisionEmpty");
    ["totalMilesMetric", "totalTimeMetric", "trafficDelayMetric", "grossPerMileMetric", "grossHourlyMetric", "deliveryEtaMetric", "toPickupMetric", "toDropoffMetric", "toRecoveryMetric"].forEach((id) => { $(id).textContent = "—"; });
    $("recoveryName").textContent = t("notCalculated");
    $("recoveryAddress").textContent = "—";
    $("recoveryParking").textContent = t("recoveryPending");
    $("recoveryEta").textContent = "—";
    $("routeLegs").hidden = true;
    $("routeFreshnessBadge").textContent = t("noRoute");
    $("routeFreshnessBadge").className = "mini-pill neutral";
    ["guidePickup", "guideDropoff", "guideRecovery", "acceptOffer", "declineOffer", "refreshRoute"].forEach((id) => { $(id).disabled = true; });
    clearAlerts();
  }

  function routeIsStale() {
    if (!routeState.plan || routeState.dirty) return true;
    const ageMinutes = (Date.now() - new Date(routeState.plan.computedAt).getTime()) / 60000;
    return ageMinutes >= Number(settings.routeRefreshMinutes);
  }

  function renderFreshness() {
    if (!routeState.plan) return;
    const stale = routeIsStale();
    $("routeFreshnessBadge").textContent = stale ? t("routeStale") : t("routeFresh");
    $("routeFreshnessBadge").className = `mini-pill ${stale ? "warn" : "good"}`;
    if (stale && !routeState.staleAlertSpoken) {
      addAlert(t("routeStaleAlert"), "warn");
      if (settings.voiceAlerts) speak(t("routeStaleAlert"));
      routeState.staleAlertSpoken = true;
    }
  }

  function markRouteDirty() {
    if (!routeState.plan) return;
    routeState.dirty = true;
    renderFreshness();
  }

  function addAlert(text, tone = "warn") {
    const element = document.createElement("div");
    element.className = `alert ${tone}`;
    element.textContent = text;
    $("alertStack").append(element);
  }

  function clearAlerts() {
    $("alertStack").innerHTML = "";
  }

  function notify(text, tone = "warn", spoken = false) {
    addAlert(text, tone);
    if (spoken && settings.voiceAlerts) speak(text);
    if (navigator.vibrate && tone !== "good") navigator.vibrate(tone === "bad" ? [120, 80, 120] : 90);
  }

  function chooseVoice(language) {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null;
    const priorities = language === "es-NI" ? ["es-NI", "es-419", "es-US", "es-MX", "es"] : ["en-US", "en"];
    for (const prefix of priorities) {
      const exact = voices.find((voice) => voice.lang.toLowerCase() === prefix.toLowerCase());
      if (exact) return exact;
      const partial = voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix.toLowerCase()));
      if (partial) return partial;
    }
    return null;
  }

  function speak(text, options = {}) {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setStatus(t("noVoiceSupport"), "warn");
      return;
    }
    if (!options.queue) speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = settings.language === "es-NI" ? "es-NI" : "en-US";
    utterance.rate = Number(settings.voiceRate || 1);
    const voice = chooseVoice(settings.language);
    if (voice) utterance.voice = voice;
    speechSynthesis.speak(utterance);
  }

  function speakAnalysis(analysis) {
    const key = analysis.verdict === "ACCEPT" ? "voiceAccept" : analysis.verdict === "MAYBE" ? "voiceMaybe" : "voiceDecline";
    const text = t(key, {
      miles: oneDecimal(analysis.totalMiles),
      minutes: Math.ceil(analysis.totalMinutes),
      name: analysis.recovery.name,
      address: analysis.recovery.address || "",
      parking: analysis.recovery.parking,
    });
    speak(text);
  }

  function startGuidance(legKey) {
    if (!settings.spokenGuidance) {
      notify(t("guidanceOff"), "warn", true);
      return;
    }
    const leg = routeState.plan?.legs?.[legKey];
    const route = defaultRoute(leg);
    const steps = route?.steps || [];
    if (!steps.length) {
      notify(t("guidanceUnavailable"), "warn", true);
      return;
    }

    stopGuidance({ silent: true });
    const destination = legKey === "toPickup" ? $("pickupAddress").value.trim() : legKey === "toDropoff" ? $("dropoffAddress").value.trim() : routeState.selectedRecovery?.name || t("recovery");
    guidanceState.active = true;
    guidanceState.legKey = legKey;
    guidanceState.destination = destination;
    guidanceState.steps = steps;
    guidanceState.stepIndex = 0;
    guidanceState.approachSpoken = false;
    $("stopGuidance").disabled = false;
    renderGuidanceStatus();
    speak(t("guidanceStarting", { destination }));
    setTimeout(() => speak(currentStepInstruction(), { queue: true }), 600);

    if (!navigator.geolocation) {
      notify(t("locationLost"), "bad", true);
      return;
    }
    guidanceState.watchId = navigator.geolocation.watchPosition(handleGuidancePosition, () => notify(t("locationLost"), "bad", true), {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 15000,
    });
  }

  function currentStepInstruction() {
    const step = guidanceState.steps[guidanceState.stepIndex];
    return step?.instruction || t("continueInstruction");
  }

  function handleGuidancePosition({ coords }) {
    if (!guidanceState.active) return;
    guidanceState.lastPositionAt = Date.now();
    const step = guidanceState.steps[guidanceState.stepIndex];
    if (!step) return finishGuidance();
    const end = step.endLocation;
    if (!end) return;
    const distanceMeters = haversineMeters(coords.latitude, coords.longitude, end.latitude, end.longitude);
    const approachThreshold = Math.min(550, Math.max(140, Number(step.distanceMeters || 300) * 0.35));

    if (!guidanceState.approachSpoken && distanceMeters <= approachThreshold && distanceMeters > 65) {
      guidanceState.approachSpoken = true;
      speak(t("inDistance", { distance: formatSpokenDistance(distanceMeters), instruction: currentStepInstruction() }));
    }

    if (distanceMeters <= 55) {
      guidanceState.stepIndex += 1;
      guidanceState.approachSpoken = false;
      if (guidanceState.stepIndex >= guidanceState.steps.length) finishGuidance();
      else speak(currentStepInstruction());
    }
  }

  function finishGuidance() {
    const destination = guidanceState.destination;
    const wasRecovery = guidanceState.legKey === "toRecovery";
    stopGuidance({ silent: true });
    speak(t("guidanceArrived", { destination }));
    if (wasRecovery && routeState.selectedRecovery?.parking) {
      setTimeout(() => speak(routeState.selectedRecovery.parking, { queue: true }), 700);
    }
  }

  function stopGuidance(options = {}) {
    if (guidanceState.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(guidanceState.watchId);
    guidanceState.watchId = null;
    guidanceState.active = false;
    guidanceState.legKey = null;
    guidanceState.destination = "";
    guidanceState.steps = [];
    guidanceState.stepIndex = 0;
    guidanceState.approachSpoken = false;
    $("stopGuidance").disabled = true;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    renderGuidanceStatus();
    if (!options.silent) setStatus(t("guidanceStopped"), "neutral");
  }

  function renderGuidanceStatus() {
    $("guidanceStatus").textContent = guidanceState.active ? t("guidanceActive", { destination: guidanceState.destination }) : t("guidanceIdle");
  }

  function formatSpokenDistance(meters) {
    if (meters < 160) {
      const feet = Math.max(50, Math.round((meters * 3.28084) / 50) * 50);
      return settings.language === "es-NI" ? `${feet} pies` : `${feet} feet`;
    }
    const miles = meters / 1609.344;
    return settings.language === "es-NI" ? `${miles.toFixed(1)} millas` : `${miles.toFixed(1)} miles`;
  }

  function haversineMeters(lat1, lon1, lat2, lon2) {
    const toRad = (degrees) => degrees * Math.PI / 180;
    const earth = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function startShift() {
    if (shift.state === "off") {
      shift.state = "active";
      shift.startedAt = Date.now();
      shift.endedAt = null;
      shift.totalBreakMs = 0;
      shift.breakStartedAt = null;
      saveShift();
      renderShift();
      if (settings.voiceAlerts) speak(t("shiftStarted"));
    }
  }

  function acceptCurrentOffer() {
    if (!lastAnalysis) return;
    if (shift.state === "off") startShift();
    shift.activeOffer = {
      acceptedAt: Date.now(),
      payout: lastAnalysis.payout,
      pickup: lastAnalysis.pickupText,
      dropoff: lastAnalysis.dropoffText,
      recovery: lastAnalysis.recovery,
      plannedMiles: lastAnalysis.totalMiles,
      plannedMinutes: lastAnalysis.totalMinutes,
      score: lastAnalysis.score,
      verdict: lastAnalysis.verdict,
      computedAt: lastAnalysis.computedAt,
    };
    saveShift();
    renderShift();
    activateTab("shift");
    notify(t("activeStarted"), "good", true);
  }

  function completeActiveOffer() {
    const active = shift.activeOffer;
    if (!active) return;
    const minutes = Math.max(1, (Date.now() - active.acceptedAt) / 60000);
    const net = active.payout - active.plannedMiles * Number(settings.vehicleCost);
    shift.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status: "Completed",
      pickup: active.pickup,
      payout: active.payout,
      miles: active.plannedMiles,
      minutes,
      recovery: active.recovery?.name || "",
      recoveryAddress: active.recovery?.address || "",
      net,
      score: active.score,
      verdict: active.verdict,
    });
    shift.activeOffer = null;
    saveShift();
    renderShift();
    notify(t("completed"), "good", true);
  }

  function logDecline() {
    if (!lastAnalysis) return;
    shift.logs.unshift({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status: "Declined",
      pickup: lastAnalysis.pickupText,
      payout: lastAnalysis.payout,
      miles: lastAnalysis.totalMiles,
      minutes: lastAnalysis.totalMinutes,
      recovery: lastAnalysis.recovery.name,
      recoveryAddress: lastAnalysis.recovery.address || "",
      net: 0,
      score: lastAnalysis.score,
      verdict: lastAnalysis.verdict,
    });
    saveShift();
    renderShift();
    notify(t("declinedLogged"), "neutral", true);
  }

  function saveShift() {
    saveJson(STORAGE_KEYS.shift, shift);
  }

  function activeElapsedMs() {
    if (!shift.startedAt) return 0;
    const end = shift.state === "off" && shift.endedAt ? shift.endedAt : Date.now();
    const currentBreak = shift.state === "break" && shift.breakStartedAt ? end - shift.breakStartedAt : 0;
    return Math.max(0, end - shift.startedAt - shift.totalBreakMs - currentBreak);
  }

  function renderShift() {
    const isActive = shift.state === "active";
    const isBreak = shift.state === "break";
    $("shiftStatus").textContent = isActive ? t("shiftActive") : isBreak ? t("shiftBreak") : t("shiftOff");
    $("shiftStatus").className = `status-pill ${isActive ? "status-on" : isBreak ? "status-break" : "status-off"}`;
    $("startShift").disabled = shift.state !== "off";
    $("startBreak").disabled = !isActive;
    $("endBreak").disabled = !isBreak;
    $("endShift").disabled = shift.state === "off";

    const completed = shift.logs.filter((entry) => entry.status === "Completed");
    const gross = completed.reduce((sum, entry) => sum + Number(entry.payout || 0), 0);
    const miles = completed.reduce((sum, entry) => sum + Number(entry.miles || 0), 0);
    const cost = miles * Number(settings.vehicleCost);
    const activeHours = activeElapsedMs() / 3600000;
    $("elapsedMetric").textContent = formatDuration(activeElapsedMs());
    $("shiftGrossMetric").textContent = money(gross);
    $("shiftMilesMetric").textContent = oneDecimal(miles);
    $("shiftCostMetric").textContent = money(cost);
    $("shiftNetMetric").textContent = money(gross - cost);
    $("shiftHourlyMetric").textContent = money(activeHours > 0 ? gross / activeHours : 0);

    $("activeOfferCard").hidden = !shift.activeOffer;
    if (shift.activeOffer) {
      $("activeOfferSummary").textContent = `${shift.activeOffer.pickup} · ${money(shift.activeOffer.payout)}`;
      $("activeOfferTimer").textContent = formatDuration(Date.now() - shift.activeOffer.acceptedAt);
    }

    const body = $("deliveryLogBody");
    if (!shift.logs.length) {
      body.innerHTML = `<tr><td colspan="7" class="empty-state">${escapeHtml(t("noRecords"))}</td></tr>`;
      return;
    }
    body.innerHTML = shift.logs.map((entry) => {
      const status = entry.status === "Completed" ? t("completedStatus") : entry.status === "Declined" ? t("declinedStatus") : t("acceptedStatus");
      return `<tr>
        <td>${escapeHtml(formatClock(entry.timestamp))}</td>
        <td>${escapeHtml(status)}</td>
        <td>${escapeHtml(entry.pickup || "—")}</td>
        <td>${escapeHtml(money(entry.payout))}</td>
        <td>${escapeHtml(oneDecimal(entry.miles))}</td>
        <td>${escapeHtml(oneDecimal(entry.minutes))}</td>
        <td>${escapeHtml(entry.recovery || "—")}</td>
      </tr>`;
    }).join("");
  }

  function renderRecoveryPoints() {
    const list = $("recoveryPointList");
    if (!recoveryPoints.length) {
      list.innerHTML = `<div class="empty-state">${escapeHtml(t("noRecoveryPoints"))}</div>`;
      return;
    }
    list.innerHTML = recoveryPoints.map((point) => {
      const coordinateText = Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))
        ? `${t("exactGps")} · ${Number(point.latitude).toFixed(5)}, ${Number(point.longitude).toFixed(5)}`
        : t("addressBased");
      return `<article class="recovery-item ${point.active ? "" : "inactive"}">
        <div>
          <h3>${escapeHtml(point.name)}</h3>
          <p>${escapeHtml(point.address || coordinateText)}</p>
          <p>${escapeHtml(point.parking)}</p>
          <span class="point-meta">${escapeHtml(coordinateText)}${point.preferred ? ` · ${escapeHtml(t("preferred"))}` : ""}${point.active ? "" : ` · ${escapeHtml(t("inactive"))}`}</span>
        </div>
        <div class="recovery-actions">
          <button class="text-button edit-recovery" type="button" data-id="${escapeHtml(point.id)}">${escapeHtml(t("edit"))}</button>
          <button class="text-button delete-recovery" type="button" data-id="${escapeHtml(point.id)}">${escapeHtml(t("delete"))}</button>
        </div>
      </article>`;
    }).join("");
  }

  async function saveCurrentRecoveryPosition() {
    try {
      const position = await getCurrentPosition({ fresh: true });
      recoveryEditCoordinates = { latitude: position.latitude, longitude: position.longitude };
      renderRecoveryCoordinates();
      setStatus(t("locationSaved"), "good");
    } catch (error) {
      notify(error.message, "bad", true);
    }
  }

  function renderRecoveryCoordinates() {
    $("recoveryCoordinates").textContent = recoveryEditCoordinates
      ? t("exactCoordinates", { lat: recoveryEditCoordinates.latitude.toFixed(6), lng: recoveryEditCoordinates.longitude.toFixed(6) })
      : t("noCoordinates");
  }

  function saveRecoveryPoint(event) {
    event.preventDefault();
    const id = $("recoveryPointId").value || crypto.randomUUID();
    const address = $("recoveryPointAddress").value.trim();
    if (!address && !recoveryEditCoordinates) {
      notify(t("noAddressOrGps"), "bad", true);
      return;
    }
    const record = {
      id,
      name: $("recoveryPointName").value.trim(),
      address,
      parking: $("recoveryPointParking").value.trim(),
      preferred: $("recoveryPointPreferred").checked,
      active: $("recoveryPointActive").checked,
      ...(recoveryEditCoordinates || {}),
    };
    const index = recoveryPoints.findIndex((point) => point.id === id);
    if (index >= 0) recoveryPoints[index] = record;
    else recoveryPoints.push(record);
    saveJson(STORAGE_KEYS.recovery, recoveryPoints);
    resetRecoveryForm();
    renderRecoveryPoints();
    notify(t("pointSaved"), "good", true);
  }

  function editRecoveryPoint(id) {
    const point = recoveryPoints.find((item) => item.id === id);
    if (!point) return;
    $("recoveryPointId").value = point.id;
    $("recoveryPointName").value = point.name;
    $("recoveryPointAddress").value = point.address || "";
    $("recoveryPointParking").value = point.parking || "";
    $("recoveryPointPreferred").checked = Boolean(point.preferred);
    $("recoveryPointActive").checked = Boolean(point.active);
    recoveryEditCoordinates = Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)) ? { latitude: Number(point.latitude), longitude: Number(point.longitude) } : null;
    renderRecoveryCoordinates();
    $("cancelRecoveryEdit").hidden = false;
  }

  function deleteRecoveryPoint(id) {
    if (!confirm(t("confirmDeletePoint"))) return;
    recoveryPoints = recoveryPoints.filter((point) => point.id !== id);
    saveJson(STORAGE_KEYS.recovery, recoveryPoints);
    renderRecoveryPoints();
    notify(t("pointDeleted"), "neutral", false);
  }

  function resetRecoveryForm() {
    $("recoveryPointForm").reset();
    $("recoveryPointId").value = "";
    $("recoveryPointActive").checked = true;
    recoveryEditCoordinates = null;
    renderRecoveryCoordinates();
    $("cancelRecoveryEdit").hidden = true;
  }

  function populateSettings() {
    $("settingsLanguage").value = settings.language;
    $("languageSelect").value = settings.language;
    $("voiceRate").value = settings.voiceRate;
    $("voiceAlerts").checked = settings.voiceAlerts;
    $("spokenGuidance").checked = settings.spokenGuidance;
    $("avoidTolls").checked = settings.avoidTolls;
    $("avoidFerries").checked = settings.avoidFerries;
    $("routeAlternatives").checked = settings.routeAlternatives;
    $("routeRefreshMinutes").value = settings.routeRefreshMinutes;
    $("routesWorkerUrl").value = settings.routesWorkerUrl;
    $("vehicleCost").value = settings.vehicleCost;
    $("minimumPayout").value = settings.minimumPayout;
    $("targetGrossPerMile").value = settings.targetGrossPerMile;
    $("targetGrossHourly").value = settings.targetGrossHourly;
    $("defaultPickupWait").value = settings.defaultPickupWait;
    $("defaultDropoffMinutes").value = settings.defaultDropoffMinutes;
  }

  function saveNavigationSettings(event) {
    event.preventDefault();
    settings = {
      ...settings,
      language: $("settingsLanguage").value,
      voiceRate: clamp(readNumber("voiceRate", 1), 0.7, 1.3),
      voiceAlerts: $("voiceAlerts").checked,
      spokenGuidance: $("spokenGuidance").checked,
      avoidTolls: $("avoidTolls").checked,
      avoidFerries: $("avoidFerries").checked,
      routeAlternatives: $("routeAlternatives").checked,
      routeRefreshMinutes: clamp(readNumber("routeRefreshMinutes", 4), 1, 30),
      routesWorkerUrl: $("routesWorkerUrl").value.trim().replace(/\/+$/, ""),
    };
    saveJson(STORAGE_KEYS.settings, settings);
    applyLanguage();
    markRouteDirty();
    notify(t("settingsSaved"), "good", true);
  }

  function saveEconomicsSettings(event) {
    event.preventDefault();
    settings = {
      ...settings,
      vehicleCost: Math.max(0, readNumber("vehicleCost", 0.5)),
      minimumPayout: Math.max(0, readNumber("minimumPayout", 7)),
      targetGrossPerMile: Math.max(0, readNumber("targetGrossPerMile", 1.75)),
      targetGrossHourly: Math.max(0, readNumber("targetGrossHourly", 25)),
      defaultPickupWait: clamp(readNumber("defaultPickupWait", 8), 0, 60),
      defaultDropoffMinutes: clamp(readNumber("defaultDropoffMinutes", 3), 0, 30),
    };
    saveJson(STORAGE_KEYS.settings, settings);
    renderShift();
    if (lastAnalysis) lastAnalysis = evaluateOffer({ payout: lastAnalysis.payout, pickupText: lastAnalysis.pickupText, dropoffText: lastAnalysis.dropoffText, plan: lastAnalysis.plan, recovery: lastAnalysis.recovery });
    if (lastAnalysis) renderAnalysis(lastAnalysis, { speak: false });
    notify(t("settingsSaved"), "good", true);
  }

  async function testRoutesApi(options = {}) {
    const url = routeWorkerBase();
    if (!url) {
      $("routesApiTestResult").textContent = t("serviceMissing");
      setServiceStatus(t("routeOffline"), "bad");
      return;
    }
    try {
      const response = await fetch(`${url}/health`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || `HTTP ${response.status}`);
      const configured = body.providerConfigured ?? body.routesApiConfigured;
      $("routesApiTestResult").textContent = configured ? t("serviceOnline") : t("serviceNotConfigured");
      setServiceStatus(configured ? t("routeOnline") : t("routeOffline"), configured ? "good" : "bad");
      if (!options.silent && settings.voiceAlerts) speak(configured ? t("serviceOnline") : t("serviceNotConfigured"));
    } catch {
      $("routesApiTestResult").textContent = t("serviceTestFailed");
      setServiceStatus(t("routeOffline"), "bad");
      if (!options.silent && settings.voiceAlerts) speak(t("serviceTestFailed"));
    }
  }

  function resetOffer() {
    $("offerForm").reset();
    routeState.plan = null;
    routeState.selectedRecovery = null;
    routeState.dirty = false;
    lastAnalysis = null;
    stopGuidance({ silent: true });
    resetResultView();
    setStatus(t("readyForInputs"), "neutral");
    renderOriginSummary();
  }

  function exportCsv() {
    const headers = ["timestamp", "status", "pickup", "payout", "miles", "minutes", "recovery", "recovery_address", "estimated_net", "score", "verdict"];
    const rows = shift.logs.map((entry) => [new Date(entry.timestamp).toISOString(), entry.status, entry.pickup, entry.payout, entry.miles, entry.minutes, entry.recovery, entry.recoveryAddress, entry.net, entry.score, entry.verdict]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `apex-dispatch-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function activateTab(name) {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === name));
  }

  function setupEvents() {
    document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.tab)));
    $("offerForm").addEventListener("submit", (event) => { event.preventDefault(); analyzeOffer(); });
    $("resetOffer").addEventListener("click", resetOffer);
    $("useCurrentLocation").addEventListener("click", useCurrentLocationForOrigin);
    $("toggleOriginAddress").addEventListener("click", toggleOriginAddress);
    $("originAddress").addEventListener("input", () => { routeState.useGpsOrigin = false; renderOriginSummary(); markRouteDirty(); });
    ["payout", "pickupAddress", "dropoffAddress"].forEach((id) => $(id).addEventListener("input", markRouteDirty));
    $("refreshRoute").addEventListener("click", analyzeOffer);
    $("acceptOffer").addEventListener("click", acceptCurrentOffer);
    $("declineOffer").addEventListener("click", logDecline);
    $("guidePickup").addEventListener("click", () => startGuidance("toPickup"));
    $("guideDropoff").addEventListener("click", () => startGuidance("toDropoff"));
    $("guideRecovery").addEventListener("click", () => startGuidance("toRecovery"));
    $("stopGuidance").addEventListener("click", () => stopGuidance());

    $("startShift").addEventListener("click", startShift);
    $("startBreak").addEventListener("click", () => { shift.state = "break"; shift.breakStartedAt = Date.now(); saveShift(); renderShift(); if (settings.voiceAlerts) speak(t("breakStarted")); });
    $("endBreak").addEventListener("click", () => { if (shift.breakStartedAt) shift.totalBreakMs += Date.now() - shift.breakStartedAt; shift.breakStartedAt = null; shift.state = "active"; saveShift(); renderShift(); if (settings.voiceAlerts) speak(t("breakEnded")); });
    $("endShift").addEventListener("click", () => { if (shift.state === "break" && shift.breakStartedAt) shift.totalBreakMs += Date.now() - shift.breakStartedAt; shift.breakStartedAt = null; shift.state = "off"; shift.endedAt = Date.now(); saveShift(); renderShift(); if (settings.voiceAlerts) speak(t("shiftEnded")); });
    $("completeOffer").addEventListener("click", completeActiveOffer);
    $("exportCsv").addEventListener("click", exportCsv);
    $("clearShiftData").addEventListener("click", () => { if (!confirm(t("confirmClearShift"))) return; shift = clone(defaultShift); saveShift(); renderShift(); });

    $("recoveryPointForm").addEventListener("submit", saveRecoveryPoint);
    $("saveRecoveryGps").addEventListener("click", saveCurrentRecoveryPosition);
    $("cancelRecoveryEdit").addEventListener("click", resetRecoveryForm);
    $("recoveryPointList").addEventListener("click", (event) => {
      const edit = event.target.closest(".edit-recovery");
      const remove = event.target.closest(".delete-recovery");
      if (edit) editRecoveryPoint(edit.dataset.id);
      if (remove) deleteRecoveryPoint(remove.dataset.id);
    });

    $("settingsForm").addEventListener("submit", saveNavigationSettings);
    $("economicsForm").addEventListener("submit", saveEconomicsSettings);
    $("testRoutesApi").addEventListener("click", () => { settings.routesWorkerUrl = $("routesWorkerUrl").value.trim().replace(/\/+$/, ""); testRoutesApi(); });
    $("languageSelect").addEventListener("change", () => { settings.language = $("languageSelect").value; saveJson(STORAGE_KEYS.settings, settings); populateSettings(); applyLanguage(); });

    window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; $("installButton").hidden = false; });
    $("installButton").addEventListener("click", async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $("installButton").hidden = true; });
    window.addEventListener("beforeunload", () => stopGuidance({ silent: true }));
  }

  setupEvents();
  populateSettings();
  applyLanguage();
  renderRecoveryCoordinates();
  resetResultView();
  renderShift();
  renderRecoveryPoints();
  testRoutesApi({ silent: true });

  setInterval(() => {
    renderShift();
    renderFreshness();
    if (guidanceState.active && guidanceState.lastPositionAt && Date.now() - guidanceState.lastPositionAt > 30000) {
      notify(t("locationLost"), "warn", true);
      guidanceState.lastPositionAt = Date.now();
    }
  }, 15000);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
  }
})();
