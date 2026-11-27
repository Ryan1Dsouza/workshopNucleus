import {MARIO_KART_PROFILE, kartRaceProfile} from '../../core/controller-profiles.js';
/**
 * ControllerKit adapter for OpenWii 3D Mario Kart.
 */
export class MarioKartAdapter {
  constructor(context) {
    this.context = context;
    this.paused = true;
    this.api = null;
  }

  async mount(container) {
    this.frame = document.createElement('iframe');
    this.frame.kartHasPhone=this.context.hasPhone;
    // The game-card click activates the host document. A BLE notification
    // cannot unlock a fresh AudioContext in the subsequently loaded iframe.
    const Ctx=window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      this.audioContext=new Ctx({latencyHint:'interactive'});
      this.frame.kartAudioContext=this.audioContext;
      if (navigator.userActivation?.hasBeenActive) void this.audioContext.resume().catch(()=>{});
    }
    this.frame.title = 'Mario Kart game';
    this.frame.allow = 'autoplay';
    this.frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;';

    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener('message', this.readyListener);
        reject(new Error('Mario Kart did not finish loading.'));
      }, 25000);
      this.readyListener = (event) => {
        if (event.source !== this.frame.contentWindow || event.origin !== location.origin) return;
        if (event.data?.type === 'kart-menu-ready') {
          // The interactive menu can accept Start even on a slow course download.
          this.context.setPhoneMenu?.(this.frame.contentWindow.kartPhoneMenu);
          if(document.activeElement?.matches('[data-game="kart-racing"]'))this.frame.contentWindow.focus();
          clearTimeout(timer);
        } else if (event.data?.type === 'kart-ready') {
          this.api = this.frame.contentWindow.__openwii;
          clearTimeout(timer);
          window.removeEventListener('message', this.readyListener);
          resolve();
        } else if (event.data?.type === 'kart-error') {
          clearTimeout(timer);
          window.removeEventListener('message', this.readyListener);
          reject(new Error(event.data.message));
        }
      };
      window.addEventListener('message', this.readyListener);
      this.frame.addEventListener('load', () => {
        this.api = this.frame.contentWindow.__openwii;
        if (this.api?.setControllerState) {
          clearTimeout(timer);
          window.removeEventListener('message', this.readyListener);
          resolve();
        }
      }, { once: true });
    });

    this.feedback = (event) => {
      if (event.source !== this.frame.contentWindow || event.origin !== location.origin) return;
      if (event.data?.type === 'game-feedback') {
        this.context.feedback(event.data.data);
      } else if (event.data?.type === 'game-state') {
        this.paused = !!event.data.paused;
        this.context.onState?.({ paused: this.paused });
      }
    };
    window.addEventListener('message', this.feedback);
    this.frame.addEventListener('kart-controller-layout', ({detail:layout}) => {
      if (['menu', 'gyro', 'dpad'].includes(layout)) {
        this.context.setControllerProfile?.(layout === 'menu' ? MARIO_KART_PROFILE : kartRaceProfile(layout));
      }
    });
    this.frame.src = '/games/mario-kart/index.html';
    container.append(this.frame);
    await ready;
  }

  input(slot, state) {
    if (!this.api) return;
    this.api.setControllerState(slot, state);
  }

  handleKey(event) {
    this.api?.handleKey(event);
    return event.defaultPrevented;
  }

  releaseKeys() {
    this.api?.releaseKeys();
  }

  pause(value = true) {
    this.paused = value;
    if (!this.api) return;
    if (value) this.api.pause();
    else this.api.resume();
    this.context.onState?.({ paused: value });
  }

  reset() {
    if (!this.api) return;
    this.api.audio?.engine?.ctx?.resume?.().catch?.(() => {});
    this.api.startGame();
    this.paused = false;
    this.context.onState?.({ paused: false });
    if (document.hasFocus() && !document.hidden) {
      this.frame.contentWindow.focus();
    }
  }

  dispose() {
    if (this.feedback) window.removeEventListener('message', this.feedback);
    if (this.readyListener) window.removeEventListener('message', this.readyListener);
    if (this.api?.audio?.stop) {
      try { this.api.audio.stop(); } catch {}
    }
    if (this.frame) {
      this.frame.remove();
      this.frame.src = 'about:blank';
    }
    if(this.audioContext && this.audioContext.state!=='closed')void this.audioContext.close().catch(()=>{});
    this.api = null;
  }
}
