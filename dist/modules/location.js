export class LocationService extends EventTarget {
  constructor() {
    super();
    this.position = null;
    this.watchId = null;
  }

  locate(options = {}) {
    if (!window.isSecureContext) return Promise.reject(new Error("Current location requires HTTPS."));
    if (!navigator.geolocation) return Promise.reject(new Error("Geolocation is not supported on this device."));
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.position = normalizePosition(position);
          this.dispatchEvent(new CustomEvent("position", { detail: this.position }));
          resolve(this.position);
        },
        (error) => reject(new Error(locationErrorMessage(error))),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000, ...options },
      );
    });
  }

  startTracking(options = {}) {
    if (!window.isSecureContext) throw new Error("Location tracking requires HTTPS.");
    if (!navigator.geolocation) throw new Error("Geolocation is not supported on this device.");
    if (this.watchId !== null) return;
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.position = normalizePosition(position);
        this.dispatchEvent(new CustomEvent("position", { detail: this.position }));
      },
      (error) => this.dispatchEvent(new CustomEvent("error", { detail: new Error(locationErrorMessage(error)) })),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000, ...options },
    );
    this.dispatchEvent(new Event("trackingchange"));
  }

  stopTracking() {
    if (this.watchId === null || !navigator.geolocation) return;
    navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.dispatchEvent(new Event("trackingchange"));
  }

  clear() {
    this.stopTracking();
    this.position = null;
    this.dispatchEvent(new Event("cleared"));
  }

  get tracking() {
    return this.watchId !== null;
  }
}

function normalizePosition(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    heading: position.coords.heading,
    speed: position.coords.speed,
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}

function locationErrorMessage(error) {
  if (error.code === error.PERMISSION_DENIED) return "Location permission was denied.";
  if (error.code === error.POSITION_UNAVAILABLE) return "Current location is unavailable.";
  if (error.code === error.TIMEOUT) return "Location request timed out.";
  return "Unable to retrieve the current location.";
}
