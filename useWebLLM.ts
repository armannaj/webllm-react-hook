import {
  CreateServiceWorkerMLCEngine,
  InitProgressCallback,
  InitProgressReport,
  MLCEngine,
  MLCEngineInterface,
} from "@mlc-ai/web-llm";

export function useWebLLM() {
  let timer: number | null = null;
  let engine: MLCEngineInterface | null = null;
  let initializing = false;
  let initialized = false;
  let registration: ServiceWorkerRegistration | null = null;
  let checkingWebGPU = false;

  async function pollStatusAndInitialize({
    model,
    progressCallback,
    swPath = "/sw.js",
  }: InitOptions): Promise<MLCEngineInterface | null> {
    const isServiceWorkerRegistered = registration !== null;
    const isServiceWorkerActivated =
      registration !== null && registration.active?.state === "activated";
    const isInitializing = initializing;
    const isInitialized = initialized;

    console.log(
      "reg actved initing inited: ",
      isServiceWorkerRegistered,
      isServiceWorkerActivated,
      isInitializing,
      isInitialized
    );

    if (!isServiceWorkerRegistered) {
      const previousRegistration =
        await navigator.serviceWorker.getRegistration(swPath);
      if (previousRegistration) {
        registration = previousRegistration;
        console.log(
          "Using existing service worker registration:",
          registration
        );
      } else {
        console.log("Registering new service worker:", swPath);
        registration = await navigator.serviceWorker.register(swPath, {
          type: "module",
        });
        console.log("Service Worker registered:", registration);
      }
    }

    if (
      isServiceWorkerRegistered &&
      isServiceWorkerActivated &&
      !isInitializing
    ) {
      initializing = true;
      console.log("initializing MLC Engine...");
      engine = await CreateServiceWorkerMLCEngine(model, {
        initProgressCallback: (initProgress: InitProgressReport) => {
          localProgressCallback(initProgress, progressCallback);
        },
      });
      console.log("MLC Engine initialized:", engine);
    }

    if (
      isServiceWorkerRegistered &&
      isServiceWorkerActivated &&
      isInitializing &&
      engine !== null &&
      !checkingWebGPU &&
      !isInitialized
    ) {
      console.log("checking GPU");
      engine
        ?.getGPUVendor()
        .then((vendor) => {
          console.log("GPU Vendor 2:", vendor);
          checkingWebGPU = true;
          initialized = true;
        })
        .catch((error) => {
          console.error("Error getting GPU vendor:", error);
          throw new Error(`Error getting GPU vendor: ${error}`);
        });
    }

    if (
      isServiceWorkerRegistered &&
      isServiceWorkerActivated &&
      isInitialized
    ) {
      return engine as MLCEngineInterface;
    }

    return null;
  }

  function localProgressCallback(
    initProgress: InitProgressReport,
    userCallback: InitProgressCallback
  ) {
    console.log(initProgress);
    userCallback(initProgress);
  }

  async function checkWebGPU() {
    try {
      if ("gpu" in navigator) {
        const adapter = await (navigator.gpu as any)?.requestAdapter();
        if (adapter) {
          return true;
        } else {
          return false;
        }
      }
    } catch {
      return false;
    }
  }

  async function initializeWebLLMServiceWorker(
    model: string,
    progressCallback?: InitProgressCallback,
    swPath: string = "/sw.js",
    pollIntervalMs = 3000,
    maxRetries = 10
  ) {
    console.log("Initializing with model:", model);
    let attempts = 0;
    return new Promise<MLCEngineInterface>((resolve, reject) => {
      timer = setInterval(async () => {
        attempts++;
        const result = await pollStatusAndInitialize({
          model,
          progressCallback: progressCallback ?? (() => {}),
          swPath,
        });
        if (result !== null) {
          clearInterval(timer!);
          resolve(result);
        }
        if (attempts >= maxRetries) {
          // If max retries reached, reject the promise
          clearInterval(timer!);
          reject(
            new Error("Failed to initialize WebLLM after multiple retries.")
          );
        }
      }, pollIntervalMs);
    });
  }

  // Initialize WebLLM
  async function initializeWebLLM(
    model: string,
    progressCallback?: InitProgressCallback
  ) {
    // This is a synchronous call that returns immediately
    const engine = new MLCEngine({
      initProgressCallback: progressCallback ?? (() => {}),
    });

    // This is an asynchronous call and can take a long time to finish
    await engine.reload(model);
    return engine;
  }

  return {
    checkWebGPU,
    initializeWebLLM,
    initializeWebLLMServiceWorker,
  };
}

type InitOptions = {
  model: string;
  progressCallback: InitProgressCallback;
  swPath?: string;
  pollIntervalMs?: number;
};
