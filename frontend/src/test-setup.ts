import { vi, beforeEach } from 'vitest';

class MockEventTarget {
  private listeners: Record<string, Function[]> = {};

  addEventListener(type: string, listener: Function) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: Function) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  dispatchEvent(event: any) {
    const list = this.listeners[event.type] || [];
    list.forEach((l) => l(event));
    return true;
  }
}

class MockCustomEvent {
  type: string;
  detail: any;
  constructor(type: string, init?: { detail?: any }) {
    this.type = type;
    this.detail = init?.detail;
  }
}

class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] !== undefined ? this.store[key] : null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }

  get length(): number {
    return Object.keys(this.store).length;
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] || null;
  }
}

const mockWindow = new MockEventTarget() as any;
const storage = new MockLocalStorage();
mockWindow.localStorage = storage;
mockWindow.dispatchEvent = mockWindow.dispatchEvent.bind(mockWindow);
mockWindow.addEventListener = mockWindow.addEventListener.bind(mockWindow);
mockWindow.removeEventListener = mockWindow.removeEventListener.bind(mockWindow);

const mockDocument = new MockEventTarget() as any;
mockDocument.visibilityState = 'visible';

(globalThis as any).window = mockWindow;
(globalThis as any).document = mockDocument;
(globalThis as any).localStorage = storage;
(globalThis as any).CustomEvent = MockCustomEvent;

// Reset storage before each test
beforeEach(() => {
  storage.clear();
  mockDocument.visibilityState = 'visible';
  vi.restoreAllMocks();
});
