// Silent Client-Side Behavioral Bot-Detection Engine for Simcha Booking Sign-In
// Monitors touch interaction patterns (duration, pressure, coordinate variance) on mobile
// and mouse velocity trajectories (checking for perfectly linear paths & impossible speeds) on desktop.

export interface TouchSample {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationMs: number;
  pressure: number;
  radiusX: number;
  radiusY: number;
  moveDelta: number;
  timestamp: number;
  isTrusted: boolean;
}

export interface MousePoint {
  x: number;
  y: number;
  t: number;
  isTrusted: boolean;
}

export interface MouseSegmentMetrics {
  distancePx: number;
  dtMs: number;
  velocityPxPerMs: number;
  angleRad: number;
}

export interface BotTelemetrySummary {
  deviceType: 'mobile-touch' | 'desktop-mouse' | 'keyboard-only' | 'hybrid' | 'none';
  sessionDurationMs: number;
  formInteractionDurationMs: number;
  mouseSampleCount: number;
  maxMouseVelocityPxPerMs: number;
  avgMouseVelocityPxPerMs: number;
  mouseVelocityCv: number;
  meanMouseLinearity: number;
  angularVariance: number;
  touchCount: number;
  avgTouchDurationMs: number;
  touchDurationStdDev: number;
  touchCoordVariance: number;
  avgTouchPressure: number;
  touchPressureVariance: number;
  keystrokeCount: number;
  avgKeyIntervalMs: number;
  keyIntervalStdDev: number;
  untrustedEventCount: number;
  trustedEventCount: number;
  webdriverDetected: boolean;
  honeypotTriggered: boolean;
}

export interface BotEvaluationResult {
  allowed: boolean;
  behaviorScore: number; // 0 - 100 (100 = verified human, < 45 = blocked bot)
  isFlagged: boolean;
  flagId: string | null;
  reasons: string[];
  telemetry: BotTelemetrySummary;
}

const MAX_MOUSE_POINTS = 240;
const MAX_TOUCH_SAMPLES = 60;
const MAX_KEY_SAMPLES = 80;

class BehavioralBotDetector {
  private initialized = false;
  private pageLoadPerfTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  private signInModalOpenedPerfTime: number | null = null;

  private mousePoints: MousePoint[] = [];
  private touchSamples: TouchSample[] = [];
  private activeTouches = new Map<
    number,
    {
      startX: number;
      startY: number;
      lastX: number;
      lastY: number;
      startTime: number;
      maxPressure: number;
      radiusX: number;
      radiusY: number;
      totalMoveDist: number;
      isTrusted: boolean;
    }
  >();

  private keyTimestamps: number[] = [];
  private keyDwellTimes: number[] = [];
  private activeKeyDowns = new Map<string, number>();

  private untrustedEventCount = 0;
  private trustedEventCount = 0;
  private honeypotValue = '';

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  public init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;
    this.pageLoadPerfTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const opts: AddEventListenerOptions = { passive: true, capture: true };

    window.addEventListener('mousemove', this.handleMouseMove, opts);
    window.addEventListener('mousedown', this.handleMouseDown, opts);
    window.addEventListener('touchstart', this.handleTouchStart, opts);
    window.addEventListener('touchmove', this.handleTouchMove, opts);
    window.addEventListener('touchend', this.handleTouchEnd, opts);
    window.addEventListener('pointerdown', this.handlePointerDown, opts);
    window.addEventListener('keydown', this.handleKeyDown, opts);
    window.addEventListener('keyup', this.handleKeyUp, opts);
  }

  public markSignInFormOpened(): void {
    this.signInModalOpenedPerfTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.honeypotValue = '';
  }

  public setHoneypotValue(val: string): void {
    this.honeypotValue = val;
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private recordTrust(isTrusted: boolean): void {
    if (isTrusted) {
      this.trustedEventCount++;
    } else {
      this.untrustedEventCount++;
    }
  }

  private handleMouseMove = (e: MouseEvent): void => {
    this.recordTrust(e.isTrusted);
    const t = this.now();
    const last = this.mousePoints[this.mousePoints.length - 1];
    // Sample at >= 4ms intervals or if coordinate jumped significantly to capture high-speed bots
    if (last && t - last.t < 4 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 50) {
      return;
    }

    this.mousePoints.push({
      x: e.clientX,
      y: e.clientY,
      t,
      isTrusted: e.isTrusted,
    });

    if (this.mousePoints.length > MAX_MOUSE_POINTS) {
      this.mousePoints.shift();
    }
  };

  private handleMouseDown = (e: MouseEvent): void => {
    this.recordTrust(e.isTrusted);
    const t = this.now();
    this.mousePoints.push({
      x: e.clientX,
      y: e.clientY,
      t,
      isTrusted: e.isTrusted,
    });
    if (this.mousePoints.length > MAX_MOUSE_POINTS) {
      this.mousePoints.shift();
    }
  };

  private handlePointerDown = (e: PointerEvent): void => {
    // Capture pressure from PointerEvents for touch devices that report pressure via Pointer API
    if (e.pointerType === 'touch') {
      const existing = this.activeTouches.get(e.pointerId);
      if (existing && e.pressure > 0) {
        existing.maxPressure = Math.max(existing.maxPressure, e.pressure);
      }
    }
  };

  private handleTouchStart = (e: TouchEvent): void => {
    this.recordTrust(e.isTrusted);
    const t = this.now();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const force = typeof touch.force === 'number' ? touch.force : 0;
      const radiusX = typeof touch.radiusX === 'number' ? touch.radiusX : 0;
      const radiusY = typeof touch.radiusY === 'number' ? touch.radiusY : 0;
      this.activeTouches.set(touch.identifier, {
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        startTime: t,
        maxPressure: force,
        radiusX,
        radiusY,
        totalMoveDist: 0,
        isTrusted: e.isTrusted,
      });
    }
  };

  private handleTouchMove = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const active = this.activeTouches.get(touch.identifier);
      if (active) {
        const stepDist = Math.hypot(touch.clientX - active.lastX, touch.clientY - active.lastY);
        active.totalMoveDist += stepDist;
        active.lastX = touch.clientX;
        active.lastY = touch.clientY;
        if (typeof touch.force === 'number' && touch.force > active.maxPressure) {
          active.maxPressure = touch.force;
        }
      }
    }
  };

  private handleTouchEnd = (e: TouchEvent): void => {
    this.recordTrust(e.isTrusted);
    const t = this.now();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const active = this.activeTouches.get(touch.identifier);
      if (active) {
        const durationMs = Math.max(0, t - active.startTime);
        const force = typeof touch.force === 'number' && touch.force > 0 ? touch.force : active.maxPressure;
        this.touchSamples.push({
          startX: active.startX,
          startY: active.startY,
          endX: touch.clientX,
          endY: touch.clientY,
          durationMs,
          pressure: force,
          radiusX: active.radiusX || (typeof touch.radiusX === 'number' ? touch.radiusX : 0),
          radiusY: active.radiusY || (typeof touch.radiusY === 'number' ? touch.radiusY : 0),
          moveDelta: active.totalMoveDist,
          timestamp: t,
          isTrusted: active.isTrusted && e.isTrusted,
        });
        this.activeTouches.delete(touch.identifier);

        if (this.touchSamples.length > MAX_TOUCH_SAMPLES) {
          this.touchSamples.shift();
        }
      }
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    this.recordTrust(e.isTrusted);
    if (e.repeat) return;
    const t = this.now();
    this.keyTimestamps.push(t);
    if (this.keyTimestamps.length > MAX_KEY_SAMPLES) {
      this.keyTimestamps.shift();
    }
    this.activeKeyDowns.set(e.code || e.key, t);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    const t = this.now();
    const start = this.activeKeyDowns.get(e.code || e.key);
    if (start !== undefined) {
      const dwell = Math.max(0, t - start);
      this.keyDwellTimes.push(dwell);
      if (this.keyDwellTimes.length > MAX_KEY_SAMPLES) {
        this.keyDwellTimes.shift();
      }
      this.activeKeyDowns.delete(e.code || e.key);
    }
  };

  private calcMeanAndStdDev(values: number[]): { mean: number; stdDev: number } {
    if (values.length === 0) return { mean: 0, stdDev: 0 };
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    if (values.length < 2) return { mean, stdDev: 0 };
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return { mean, stdDev: Math.sqrt(variance) };
  }

  private analyzeMouseTrajectories(): {
    maxVelocity: number;
    avgVelocity: number;
    velocityCv: number;
    meanLinearity: number;
    angularVariance: number;
    hasImpossibleTeleport: boolean;
    hasRoboticLinearPath: boolean;
  } {
    const pts = this.mousePoints;
    if (pts.length < 3) {
      return {
        maxVelocity: 0,
        avgVelocity: 0,
        velocityCv: 0,
        meanLinearity: 0,
        angularVariance: 0,
        hasImpossibleTeleport: false,
        hasRoboticLinearPath: false,
      };
    }

    const segments: MouseSegmentMetrics[] = [];
    let impossibleVelocitySegments = 0;

    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) continue;

      const dt = Math.max(0.25, pts[i].t - pts[i - 1].t);
      const velocity = dist / dt; // px per ms
      const angle = Math.atan2(dy, dx);

      if (velocity > 35 && dist > 180) {
        impossibleVelocitySegments++;
      }

      segments.push({
        distancePx: dist,
        dtMs: dt,
        velocityPxPerMs: velocity,
        angleRad: angle,
      });
    }

    if (segments.length === 0) {
      return {
        maxVelocity: 0,
        avgVelocity: 0,
        velocityCv: 0,
        meanLinearity: 0,
        angularVariance: 0,
        hasImpossibleTeleport: false,
        hasRoboticLinearPath: false,
      };
    }

    const velocities = segments.map(s => s.velocityPxPerMs);
    const maxVelocity = Math.max(...velocities);
    const { mean: avgVelocity, stdDev: velStdDev } = this.calcMeanAndStdDev(velocities);
    const velocityCv = avgVelocity > 0 ? velStdDev / avgVelocity : 0;

    // Angular variance across consecutive movement vectors
    const angleDiffs: number[] = [];
    for (let i = 1; i < segments.length; i++) {
      let diff = Math.abs(segments[i].angleRad - segments[i - 1].angleRad);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      angleDiffs.push(diff);
    }
    const { mean: angularVariance } = this.calcMeanAndStdDev(angleDiffs);

    // Sliding window linearity check (windows of 8 points)
    const windowSize = 8;
    const windowLinearities: number[] = [];
    let roboticWindows = 0;

    if (pts.length >= windowSize) {
      for (let start = 0; start <= pts.length - windowSize; start += 2) {
        const slice = pts.slice(start, start + windowSize);
        const netDisplacement = Math.hypot(
          slice[slice.length - 1].x - slice[0].x,
          slice[slice.length - 1].y - slice[0].y
        );
        let pathDist = 0;
        const winVels: number[] = [];
        for (let j = 1; j < slice.length; j++) {
          const d = Math.hypot(slice[j].x - slice[j - 1].x, slice[j].y - slice[j - 1].y);
          const dt = Math.max(0.5, slice[j].t - slice[j - 1].t);
          pathDist += d;
          if (d > 0.5) winVels.push(d / dt);
        }

        if (pathDist > 120) {
          const linearity = netDisplacement / pathDist; // 1.0 = mathematically straight line
          windowLinearities.push(linearity);
          const { mean: wMean, stdDev: wStd } = this.calcMeanAndStdDev(winVels);
          const wCv = wMean > 0 ? wStd / wMean : 1;

          // Perfectly straight path (> 0.9996) AND near-constant synthetic velocity (CV < 0.025)
          if (linearity > 0.9996 && wCv < 0.025) {
            roboticWindows++;
          }
        }
      }
    }

    const meanLinearity =
      windowLinearities.length > 0
        ? windowLinearities.reduce((a, b) => a + b, 0) / windowLinearities.length
        : 0;

    const hasImpossibleTeleport = impossibleVelocitySegments >= 3;
    const hasRoboticLinearPath =
      (roboticWindows >= 2 && windowLinearities.length >= 2) ||
      (pts.length >= 12 && meanLinearity > 0.9995 && angularVariance < 0.0015 && velocityCv < 0.03);

    return {
      maxVelocity: Number(maxVelocity.toFixed(3)),
      avgVelocity: Number(avgVelocity.toFixed(3)),
      velocityCv: Number(velocityCv.toFixed(4)),
      meanLinearity: Number(meanLinearity.toFixed(5)),
      angularVariance: Number(angularVariance.toFixed(5)),
      hasImpossibleTeleport,
      hasRoboticLinearPath,
    };
  }

  private analyzeTouchPatterns(): {
    touchCount: number;
    avgDurationMs: number;
    durationStdDev: number;
    coordVariance: number;
    avgPressure: number;
    pressureVariance: number;
    hasImpossibleTouchDuration: boolean;
    hasZeroCoordinateVariance: boolean;
    hasSyntheticPressureAnomaly: boolean;
  } {
    const samples = this.touchSamples;
    if (samples.length === 0) {
      return {
        touchCount: 0,
        avgDurationMs: 0,
        durationStdDev: 0,
        coordVariance: 0,
        avgPressure: 0,
        pressureVariance: 0,
        hasImpossibleTouchDuration: false,
        hasZeroCoordinateVariance: false,
        hasSyntheticPressureAnomaly: false,
      };
    }

    const durations = samples.map(s => s.durationMs);
    const { mean: avgDurationMs, stdDev: durationStdDev } = this.calcMeanAndStdDev(durations);

    const xs = samples.map(s => s.startX);
    const ys = samples.map(s => s.startY);
    const { stdDev: xStd } = this.calcMeanAndStdDev(xs);
    const { stdDev: yStd } = this.calcMeanAndStdDev(ys);
    const coordVariance = Math.hypot(xStd, yStd);

    const pressures = samples.map(s => s.pressure).filter(p => p > 0);
    const { mean: avgPressure, stdDev: pressureVariance } = this.calcMeanAndStdDev(pressures);

    // Impossible touch duration: multiple taps completing in < 2.5ms
    const ultraFastTaps = samples.filter(s => s.durationMs < 2.5).length;
    const hasImpossibleTouchDuration =
      (samples.length >= 2 && ultraFastTaps === samples.length) ||
      (samples.length >= 4 && avgDurationMs < 4 && durationStdDev < 0.5);

    // Zero coordinate variance across >= 4 distinct taps with robotic timing
    const hasZeroCoordinateVariance =
      samples.length >= 4 && coordVariance < 0.05 && durationStdDev < 0.5;

    // Synthetic pressure anomaly: e.g. force > 0.999 across >= 4 taps with 0 variance and 0 contact radius
    const zeroRadiusCount = samples.filter(s => s.radiusX === 0 && s.radiusY === 0).length;
    const hasSyntheticPressureAnomaly =
      pressures.length >= 4 &&
      avgPressure >= 0.999 &&
      pressureVariance === 0 &&
      zeroRadiusCount === samples.length;

    return {
      touchCount: samples.length,
      avgDurationMs: Number(avgDurationMs.toFixed(2)),
      durationStdDev: Number(durationStdDev.toFixed(2)),
      coordVariance: Number(coordVariance.toFixed(2)),
      avgPressure: Number(avgPressure.toFixed(3)),
      pressureVariance: Number(pressureVariance.toFixed(4)),
      hasImpossibleTouchDuration,
      hasZeroCoordinateVariance,
      hasSyntheticPressureAnomaly,
    };
  }

  private analyzeKeystrokes(): {
    keystrokeCount: number;
    avgIntervalMs: number;
    intervalStdDev: number;
    hasSuperhumanTyping: boolean;
  } {
    const times = this.keyTimestamps;
    if (times.length < 3) {
      return {
        keystrokeCount: times.length,
        avgIntervalMs: 0,
        intervalStdDev: 0,
        hasSuperhumanTyping: false,
      };
    }

    const intervals: number[] = [];
    for (let i = 1; i < times.length; i++) {
      const dt = times[i] - times[i - 1];
      // Ignore long pauses > 3000ms when computing burst typing cadence
      if (dt >= 0 && dt < 3000) {
        intervals.push(dt);
      }
    }

    if (intervals.length < 5) {
      return {
        keystrokeCount: times.length,
        avgIntervalMs: 0,
        intervalStdDev: 0,
        hasSuperhumanTyping: false,
      };
    }

    const { mean: avgIntervalMs, stdDev: intervalStdDev } = this.calcMeanAndStdDev(intervals);

    // Superhuman bot keystroke injection: >= 6 keystrokes with average < 8ms and robotic uniformity (< 1.5ms stdDev)
    const hasSuperhumanTyping = intervals.length >= 6 && avgIntervalMs < 8 && intervalStdDev < 1.5;

    return {
      keystrokeCount: times.length,
      avgIntervalMs: Number(avgIntervalMs.toFixed(2)),
      intervalStdDev: Number(intervalStdDev.toFixed(2)),
      hasSuperhumanTyping,
    };
  }

  public evaluateSignInAttempt(submitEvent?: React.FormEvent | Event): BotEvaluationResult {
    const currentPerf = this.now();
    const sessionDurationMs = Math.round(currentPerf - this.pageLoadPerfTime);
    const formInteractionDurationMs = Math.round(
      currentPerf - (this.signInModalOpenedPerfTime ?? this.pageLoadPerfTime)
    );

    const nativeSubmitEvent =
      submitEvent && 'nativeEvent' in submitEvent ? submitEvent.nativeEvent : submitEvent;
    const isSubmitUntrusted =
      nativeSubmitEvent && typeof nativeSubmitEvent.isTrusted === 'boolean'
        ? !nativeSubmitEvent.isTrusted
        : false;

    const mouseStats = this.analyzeMouseTrajectories();
    const touchStats = this.analyzeTouchPatterns();
    const keyStats = this.analyzeKeystrokes();

    const webdriverDetected =
      typeof navigator !== 'undefined' && Boolean((navigator as any).webdriver === true);
    const honeypotTriggered = Boolean(this.honeypotValue && this.honeypotValue.trim().length > 0);

    let deviceType: BotTelemetrySummary['deviceType'] = 'none';
    if (touchStats.touchCount > 0 && this.mousePoints.length > 5) {
      deviceType = 'hybrid';
    } else if (touchStats.touchCount > 0) {
      deviceType = 'mobile-touch';
    } else if (this.mousePoints.length > 0) {
      deviceType = 'desktop-mouse';
    } else if (keyStats.keystrokeCount > 0) {
      deviceType = 'keyboard-only';
    }

    // Start at baseline human score of 85 and adjust based on behavioral biometrics
    let score = 85;
    const reasons: string[] = [];

    // Positive human indicators
    if (this.trustedEventCount >= 3 && this.untrustedEventCount === 0) {
      score += 8;
    }
    if (
      this.mousePoints.length >= 6 &&
      !mouseStats.hasRoboticLinearPath &&
      !mouseStats.hasImpossibleTeleport &&
      mouseStats.angularVariance > 0.01
    ) {
      score += 7;
    }
    if (
      touchStats.touchCount >= 1 &&
      !touchStats.hasImpossibleTouchDuration &&
      touchStats.avgDurationMs >= 12 &&
      touchStats.avgDurationMs <= 900
    ) {
      score += 7;
    }

    // 1. Honeypot trap triggered
    if (honeypotTriggered) {
      score -= 100;
      reasons.push('HONEYPOT_TRAP_TRIGGERED');
    }

    // 2. Impossible submission speed (< 120ms after opening modal or < 220ms after page load)
    if (formInteractionDurationMs < 120 || sessionDurationMs < 220) {
      score -= 70;
      reasons.push(`IMPOSSIBLE_SUBMISSION_SPEED (${formInteractionDurationMs}ms)`);
    }

    // 3. Synthetic / untrusted DOM event injection
    if (isSubmitUntrusted || (this.untrustedEventCount > 2 && this.trustedEventCount === 0)) {
      score -= 65;
      reasons.push('SYNTHETIC_UNTRUSTED_DOM_INPUT');
    }

    // 4. Zero human interaction before credential submission
    if (
      this.trustedEventCount === 0 &&
      this.mousePoints.length === 0 &&
      touchStats.touchCount === 0 &&
      keyStats.keystrokeCount === 0
    ) {
      score -= 65;
      reasons.push('ZERO_BIOMETRIC_INTERACTION');
    }

    // 5. Desktop mouse trajectory anomalies: perfectly linear path or impossible velocity
    if (mouseStats.hasRoboticLinearPath) {
      score -= 55;
      reasons.push(
        `PERFECTLY_LINEAR_MOUSE_TRAJECTORY (linearity=${mouseStats.meanLinearity}, velCV=${mouseStats.velocityCv})`
      );
    }
    if (mouseStats.hasImpossibleTeleport) {
      score -= 55;
      reasons.push(`IMPOSSIBLE_MOUSE_VELOCITY (${mouseStats.maxVelocity}px/ms)`);
    }

    // 6. Mobile touch interaction anomalies: impossible duration, zero coordinate variance, or synthetic pressure
    if (touchStats.hasImpossibleTouchDuration) {
      score -= 55;
      reasons.push(`IMPOSSIBLE_TOUCH_DURATION (avg=${touchStats.avgDurationMs}ms)`);
    }
    if (touchStats.hasZeroCoordinateVariance) {
      score -= 50;
      reasons.push(`ZERO_TOUCH_COORDINATE_VARIANCE (variance=${touchStats.coordVariance}px)`);
    }
    if (touchStats.hasSyntheticPressureAnomaly) {
      score -= 40;
      reasons.push(`SYNTHETIC_TOUCH_PRESSURE_ANOMALY (pressure=${touchStats.avgPressure})`);
    }

    // 7. Superhuman keystroke injection speed
    if (keyStats.hasSuperhumanTyping) {
      score -= 60;
      reasons.push(`IMPOSSIBLE_KEYSTROKE_SPEED (avgInterval=${keyStats.avgIntervalMs}ms)`);
    }

    // 8. Headless automation indicator combined with weak interaction signals
    if (webdriverDetected && this.mousePoints.length < 4 && touchStats.touchCount === 0) {
      score -= 35;
      reasons.push('AUTOMATED_WEBDRIVER_SIGNATURE');
    }

    const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
    const allowed = clampedScore >= 45 && !honeypotTriggered;
    const isFlagged = !allowed || reasons.length > 0;
    const flagId = !allowed
      ? `BOT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
      : null;

    const telemetry: BotTelemetrySummary = {
      deviceType,
      sessionDurationMs,
      formInteractionDurationMs,
      mouseSampleCount: this.mousePoints.length,
      maxMouseVelocityPxPerMs: mouseStats.maxVelocity,
      avgMouseVelocityPxPerMs: mouseStats.avgVelocity,
      mouseVelocityCv: mouseStats.velocityCv,
      meanMouseLinearity: mouseStats.meanLinearity,
      angularVariance: mouseStats.angularVariance,
      touchCount: touchStats.touchCount,
      avgTouchDurationMs: touchStats.avgDurationMs,
      touchDurationStdDev: touchStats.durationStdDev,
      touchCoordVariance: touchStats.coordVariance,
      avgTouchPressure: touchStats.avgPressure,
      touchPressureVariance: touchStats.pressureVariance,
      keystrokeCount: keyStats.keystrokeCount,
      avgKeyIntervalMs: keyStats.avgIntervalMs,
      keyIntervalStdDev: keyStats.intervalStdDev,
      untrustedEventCount: this.untrustedEventCount,
      trustedEventCount: this.trustedEventCount,
      webdriverDetected,
      honeypotTriggered,
    };

    return {
      allowed,
      behaviorScore: clampedScore,
      isFlagged,
      flagId,
      reasons,
      telemetry,
    };
  }

  public async flagBlockedAttempt(
    evaluation: BotEvaluationResult,
    attemptedEmail: string,
    actionType: 'sign-in' | 'sign-up' | 'google-sign-in' = 'sign-in'
  ): Promise<void> {
    const payload = {
      flagId: evaluation.flagId || `BOT-${Date.now().toString(36).toUpperCase()}`,
      actionType,
      attemptedEmail: (attemptedEmail || 'unknown').trim().toLowerCase(),
      behaviorScore: evaluation.behaviorScore,
      reasons: evaluation.reasons,
      telemetry: evaluation.telemetry,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      timestamp: new Date().toISOString(),
    };

    try {
      const existingRaw = localStorage.getItem('simcha_flagged_bot_attempts');
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      existing.unshift(payload);
      localStorage.setItem('simcha_flagged_bot_attempts', JSON.stringify(existing.slice(0, 50)));
    } catch {
      // Ignore storage quota errors
    }

    try {
      const apiUrl = `${window.location.protocol}//${window.location.host}/api/auth/flag-bot-attempt`;
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Non-blocking background report
    }
  }
}

export const botDetectionService = new BehavioralBotDetector();
