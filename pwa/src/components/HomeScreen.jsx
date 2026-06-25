import { useState, useEffect, useRef } from 'react'
import { getFinanceSummary, getTrainingStatus, getCrossDomainAlerts, postJarvisChat } from '../api/client'
import { speak, stopSpeaking } from '../services/tts'
import './HomeScreen.css'

// ── Circuit decoration SVG ──────────────────────────────────────────────────
const CIRCUIT_SVG = `<svg viewBox="0 0 440 900" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%">
  <g stroke="rgba(32,216,236,.3)" stroke-width="0.6" fill="none">
    <path d="M 20,100 L 80,100 L 100,120 L 100,180 L 120,200"/>
    <path d="M 420,140 L 360,140 L 340,160 L 340,220"/>
    <path d="M 30,780 L 90,780 L 110,760 L 190,760"/>
    <path d="M 410,720 L 350,720 L 330,740 L 260,740"/>
    <path d="M 50,380 L 50,440 L 70,460 L 70,520"/>
    <path d="M 390,420 L 390,480 L 370,500"/>
    <path d="M 15,250 L 60,250 L 75,235"/>
    <path d="M 425,560 L 380,560 L 365,575"/>
  </g>
  <g fill="rgba(32,216,236,.5)">
    <circle cx="120" cy="200" r="2"/><circle cx="340" cy="220" r="2"/>
    <circle cx="190" cy="760" r="2"/><circle cx="260" cy="740" r="2"/>
    <circle cx="70" cy="520" r="1.5"/><circle cx="370" cy="500" r="1.5"/>
    <circle cx="75" cy="235" r="1.5"/><circle cx="365" cy="575" r="1.5"/>
  </g>
  <g fill="rgba(32,216,236,.28)">
    <rect x="76" y="96" width="9" height="3"/><rect x="88" y="96" width="5" height="3"/>
    <rect x="352" y="136" width="9" height="3"/><rect x="340" y="136" width="5" height="3"/>
    <rect x="20" y="600" width="12" height="3"/><rect x="36" y="600" width="6" height="3"/>
    <rect x="400" y="640" width="12" height="3"/><rect x="386" y="640" width="6" height="3"/>
  </g>
  <g stroke="rgba(32,216,236,.4)" stroke-width="1" fill="none">
    <path d="M 40,50 l 8,6 l -8,6"/><path d="M 56,50 l 8,6 l -8,6"/>
    <path d="M 40,70 l 8,6 l -8,6"/><path d="M 56,70 l 8,6 l -8,6"/>
  </g>
  <g stroke="rgba(32,216,236,.4)" stroke-width="0.7" fill="none">
    <polygon points="372,120 386,128 386,144 372,152 358,144 358,128"/>
    <polygon points="398,136 412,144 412,160 398,168 384,160 384,144"/>
    <polygon points="386,162 400,170 400,186 386,194 372,186 372,170"/>
  </g>
  <g stroke="rgba(32,216,236,.32)" stroke-width="0.6" fill="none">
    <polygon points="370,820 384,828 384,844 370,852 356,844 356,828"/>
    <polygon points="396,836 410,844 410,860 396,868 382,860 382,844"/>
    <polygon points="206,858 220,866 220,882 206,890 192,882 192,866"/>
    <polygon points="232,872 246,880 246,896 232,904 218,896 218,880"/>
  </g>
</svg>`

// ── Arc reactor SVG ─────────────────────────────────────────────────────────
const ARC_REACTOR_SVG = `<svg viewBox="0 0 600 600" shape-rendering="geometricPrecision">
  <defs>
    <radialGradient id="tunnel" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#000000"/>
      <stop offset="12%"  stop-color="#010608"/>
      <stop offset="38%"  stop-color="#011014"/>
      <stop offset="62%"  stop-color="rgba(2,22,28,.82)"/>
      <stop offset="85%"  stop-color="rgba(32,216,236,.07)"/>
      <stop offset="100%" stop-color="rgba(32,216,236,0)"/>
    </radialGradient>
    <radialGradient id="vigRing" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="rgba(0,0,0,0)"/>
      <stop offset="55%"  stop-color="rgba(0,0,0,0)"/>
      <stop offset="80%"  stop-color="rgba(0,0,0,.38)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,.65)"/>
    </radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2.8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glowNode" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="4.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="hotEye" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#ffffff"/>
      <stop offset="35%"  stop-color="#9af4ff"/>
      <stop offset="70%"  stop-color="#25e0f0"/>
      <stop offset="100%" stop-color="rgba(37,224,240,.2)"/>
    </radialGradient>
    <path id="op1" d="M 300,300 m -260,0 a 260,260 0 1,1 520,0 a 260,260 0 1,1 -520,0" fill="none"/>
    <path id="op2" d="M 300,300 m -210,0 a 210,210 0 1,1 420,0 a 210,210 0 1,1 -420,0" fill="none"/>
    <path id="op3" d="M 300,300 m -160,0 a 160,160 0 1,1 320,0 a 160,160 0 1,1 -320,0" fill="none"/>
  </defs>

  <!-- crosshair lines -->
  <line x1="52"  y1="300" x2="548" y2="300" stroke="rgba(32,216,236,.12)" stroke-width="0.7"/>
  <line x1="300" y1="52"  x2="300" y2="548" stroke="rgba(32,216,236,.12)" stroke-width="0.7"/>
  <line x1="130" y1="300" x2="470" y2="300" stroke="rgba(32,216,236,.24)" stroke-width="0.9"/>
  <line x1="300" y1="130" x2="300" y2="470" stroke="rgba(32,216,236,.24)" stroke-width="0.9"/>
  <line x1="196" y1="300" x2="404" y2="300" stroke="rgba(125,240,255,.50)" stroke-width="1.1"/>
  <line x1="300" y1="196" x2="300" y2="404" stroke="rgba(125,240,255,.50)" stroke-width="1.1"/>

  <!-- RING 1: outer edge -->
  <g class="sp">
    <circle cx="300" cy="300" r="285" fill="none" stroke="rgba(32,216,236,.14)" stroke-width="1"/>
    <text class="glab"><textPath href="#op1" startOffset="0%">PWR 98.2% ····· SYNC OK ····· THERM 41°C ····· FLUX 1.04 ····· NAV LOCK ····· BAT 78% ····· I/O 12.4MB/s ·····</textPath></text>
    <path d="M 300,40 A 260,260 0 0,1 511,170" fill="none" stroke="rgba(32,216,236,.75)" stroke-width="3.2" stroke-linecap="butt"/>
    <path d="M 95,430 A 260,260 0 0,1 40,280"  fill="none" stroke="rgba(32,216,236,.40)" stroke-width="1.8" stroke-linecap="butt"/>
    <path d="M 540,340 A 260,260 0 0,1 480,480" fill="none" stroke="rgba(32,216,236,.26)" stroke-width="1.2" stroke-linecap="butt"/>
  </g>

  <!-- RING 2: dominant outer band -->
  <g class="sp2">
    <circle cx="300" cy="300" r="248" fill="none" stroke="rgba(32,216,236,.08)" stroke-width="18"/>
    <circle cx="300" cy="300" r="257" fill="none" stroke="rgba(32,216,236,.22)" stroke-width="1"/>
    <circle cx="300" cy="300" r="239" fill="none" stroke="rgba(32,216,236,.18)" stroke-width="1"/>
    <circle cx="300" cy="300" r="248" fill="none" stroke="rgba(32,216,236,.86)" stroke-width="11"
      stroke-dasharray="155 32 72 32 105 32 48 32 130 32 62 32" stroke-linecap="butt"/>
    <text class="glab"><textPath href="#op2" startOffset="1%">000 ······ 060 ······ 120 ······ 180 ······ 240 ······ 300 ······</textPath></text>
  </g>

  <!-- circuit blocks at cardinals -->
  <g fill="rgba(32,216,236,.62)" stroke="none">
    <rect x="296.5" y="63"    width="7" height="4"/>
    <rect x="296.5" y="533"   width="7" height="4"/>
    <rect x="533"   y="296.5" width="4" height="7"/>
    <rect x="63"    y="296.5" width="4" height="7"/>
  </g>
  <g fill="rgba(125,240,255,.62)">
    <circle cx="300" cy="40"  r="2.2"/>
    <circle cx="300" cy="560" r="2.2"/>
    <circle cx="40"  cy="300" r="2.2"/>
    <circle cx="560" cy="300" r="2.2"/>
  </g>

  <!-- RING 3: mid asymmetric arcs -->
  <g class="sp3">
    <circle cx="300" cy="300" r="218" fill="none" stroke="rgba(32,216,236,.68)" stroke-width="3.5" stroke-dasharray="355 36 90 36" stroke-linecap="butt"/>
    <circle cx="300" cy="300" r="207" fill="none" stroke="rgba(32,216,236,.2)"  stroke-width="1"   stroke-dasharray="14 8"/>
  </g>

  <!-- RING 4: tick/data ruler -->
  <g class="sp4">
    <circle cx="300" cy="300" r="191" fill="none" stroke="rgba(32,216,236,.74)" stroke-width="5" stroke-dasharray="4 6" stroke-linecap="butt"/>
    <circle cx="300" cy="300" r="178" fill="none" stroke="rgba(32,216,236,.46)" stroke-width="2" stroke-dasharray="48 18 22 18" stroke-linecap="butt"/>
  </g>

  <!-- sweep scanner -->
  <g class="sweep">
    <path d="M 300,140 A 160,160 0 0,1 413,187" fill="none" stroke="rgba(125,240,255,.92)" stroke-width="3" stroke-linecap="butt"/>
    <circle cx="413" cy="187" r="3.5" fill="#7df0ff"/>
  </g>

  <!-- RING 5: inner medium rings -->
  <g class="sp7">
    <circle cx="300" cy="300" r="152" fill="none" stroke="rgba(32,216,236,.74)" stroke-width="2.5" stroke-dasharray="72 18 28 18 48 18" stroke-linecap="butt"/>
  </g>
  <g class="sp8">
    <circle cx="300" cy="300" r="138" fill="none" stroke="rgba(32,216,236,.78)" stroke-width="4" stroke-dasharray="22 10" stroke-linecap="butt"/>
  </g>

  <!-- RING 6: tight inner ring + spokes -->
  <g class="sp5">
    <circle cx="300" cy="300" r="118" fill="none" stroke="rgba(32,216,236,.84)" stroke-width="2.5" stroke-dasharray="42 14 16 14" stroke-linecap="butt"/>
    <g stroke="rgba(32,216,236,.45)" stroke-width="1.2">
      <line x1="300" y1="188" x2="300" y2="214"/>
      <line x1="300" y1="386" x2="300" y2="412"/>
      <line x1="188" y1="300" x2="214" y2="300"/>
      <line x1="386" y1="300" x2="412" y2="300"/>
    </g>
    <g stroke="rgba(32,216,236,.22)" stroke-width="0.8">
      <line x1="225" y1="225" x2="241" y2="241"/>
      <line x1="375" y1="225" x2="359" y2="241"/>
      <line x1="225" y1="375" x2="241" y2="359"/>
      <line x1="375" y1="375" x2="359" y2="359"/>
    </g>
  </g>

  <!-- glow nodes at ring 6 cardinal intersections -->
  <g fill="rgba(125,240,255,.92)" filter="url(#glow)">
    <circle cx="300" cy="182" r="3.2"/>
    <circle cx="300" cy="418" r="3.2"/>
    <circle cx="182" cy="300" r="3.2"/>
    <circle cx="418" cy="300" r="3.2"/>
  </g>
  <g fill="rgba(32,216,236,.75)">
    <circle cx="300" cy="109" r="2.4"/>
    <circle cx="300" cy="491" r="2.4"/>
    <circle cx="109" cy="300" r="2.4"/>
    <circle cx="491" cy="300" r="2.4"/>
  </g>

  <!-- radial data-bar ring -->
  <g class="sp8">
<line x1="400.0" y1="300.0" x2="406.0" y2="300.0" stroke="rgba(32,216,236,0.92)" stroke-width="1.6"/>
<line x1="399.8" y1="307.0" x2="405.7" y2="307.4" stroke="rgba(32,216,236,0.71)" stroke-width="1.6"/>
<line x1="399.0" y1="313.9" x2="410.9" y2="315.6" stroke="rgba(32,216,236,0.57)" stroke-width="1.6"/>
<line x1="397.8" y1="320.8" x2="419.3" y2="325.4" stroke="rgba(32,216,236,0.73)" stroke-width="1.6"/>
<line x1="396.1" y1="327.6" x2="407.7" y2="330.9" stroke="rgba(32,216,236,0.90)" stroke-width="1.6"/>
<line x1="394.0" y1="334.2" x2="401.5" y2="336.9" stroke="rgba(32,216,236,0.71)" stroke-width="1.6"/>
<line x1="391.4" y1="340.7" x2="400.5" y2="344.7" stroke="rgba(32,216,236,0.51)" stroke-width="1.6"/>
<line x1="388.3" y1="346.9" x2="402.4" y2="354.5" stroke="rgba(32,216,236,0.81)" stroke-width="1.6"/>
<line x1="384.8" y1="353.0" x2="395.0" y2="359.4" stroke="rgba(32,216,236,0.92)" stroke-width="1.6"/>
<line x1="380.9" y1="358.8" x2="385.8" y2="362.3" stroke="rgba(32,216,236,0.82)" stroke-width="1.6"/>
<line x1="376.6" y1="364.3" x2="385.8" y2="372.0" stroke="rgba(32,216,236,0.82)" stroke-width="1.6"/>
<line x1="371.9" y1="369.5" x2="380.6" y2="377.8" stroke="rgba(32,216,236,0.48)" stroke-width="1.6"/>
<line x1="366.9" y1="374.3" x2="381.6" y2="390.7" stroke="rgba(32,216,236,0.50)" stroke-width="1.6"/>
<line x1="361.6" y1="378.8" x2="365.3" y2="383.5" stroke="rgba(32,216,236,0.57)" stroke-width="1.6"/>
<line x1="355.9" y1="382.9" x2="363.7" y2="394.5" stroke="rgba(32,216,236,0.79)" stroke-width="1.6"/>
<line x1="350.0" y1="386.6" x2="353.0" y2="391.8" stroke="rgba(32,216,236,0.64)" stroke-width="1.6"/>
<line x1="343.8" y1="389.9" x2="349.1" y2="400.7" stroke="rgba(32,216,236,0.91)" stroke-width="1.6"/>
<line x1="337.5" y1="392.7" x2="345.7" y2="413.1" stroke="rgba(32,216,236,0.59)" stroke-width="1.6"/>
<line x1="330.9" y1="395.1" x2="336.5" y2="412.2" stroke="rgba(32,216,236,0.73)" stroke-width="1.6"/>
<line x1="324.2" y1="397.0" x2="326.1" y2="404.8" stroke="rgba(32,216,236,0.51)" stroke-width="1.6"/>
<line x1="317.4" y1="398.5" x2="318.8" y2="406.4" stroke="rgba(32,216,236,0.62)" stroke-width="1.6"/>
<line x1="310.5" y1="399.5" x2="312.8" y2="421.3" stroke="rgba(32,216,236,0.92)" stroke-width="1.6"/>
<line x1="303.5" y1="399.9" x2="303.8" y2="407.9" stroke="rgba(32,216,236,0.85)" stroke-width="1.6"/>
<line x1="296.5" y1="399.9" x2="296.2" y2="409.9" stroke="rgba(32,216,236,0.88)" stroke-width="1.6"/>
<line x1="289.5" y1="399.5" x2="287.2" y2="421.3" stroke="rgba(32,216,236,0.62)" stroke-width="1.6"/>
<line x1="282.6" y1="398.5" x2="281.2" y2="406.4" stroke="rgba(32,216,236,0.78)" stroke-width="1.6"/>
<line x1="275.8" y1="397.0" x2="273.9" y2="404.8" stroke="rgba(32,216,236,0.68)" stroke-width="1.6"/>
<line x1="269.1" y1="395.1" x2="263.5" y2="412.2" stroke="rgba(32,216,236,0.68)" stroke-width="1.6"/>
<line x1="262.5" y1="392.7" x2="260.3" y2="398.3" stroke="rgba(32,216,236,0.92)" stroke-width="1.6"/>
<line x1="256.2" y1="389.9" x2="253.5" y2="395.3" stroke="rgba(32,216,236,0.57)" stroke-width="1.6"/>
<line x1="250.0" y1="386.6" x2="247.0" y2="391.8" stroke="rgba(32,216,236,0.71)" stroke-width="1.6"/>
<line x1="244.1" y1="382.9" x2="235.1" y2="396.2" stroke="rgba(32,216,236,0.68)" stroke-width="1.6"/>
<line x1="238.4" y1="378.8" x2="233.5" y2="385.1" stroke="rgba(32,216,236,0.78)" stroke-width="1.6"/>
<line x1="233.1" y1="374.3" x2="223.7" y2="384.7" stroke="rgba(32,216,236,0.88)" stroke-width="1.6"/>
<line x1="228.1" y1="369.5" x2="215.1" y2="382.0" stroke="rgba(32,216,236,0.65)" stroke-width="1.6"/>
<line x1="223.4" y1="364.3" x2="209.6" y2="375.8" stroke="rgba(32,216,236,0.65)" stroke-width="1.6"/>
<line x1="219.1" y1="358.8" x2="212.6" y2="363.5" stroke="rgba(32,216,236,0.88)" stroke-width="1.6"/>
<line x1="215.2" y1="353.0" x2="208.4" y2="357.2" stroke="rgba(32,216,236,0.54)" stroke-width="1.6"/>
<line x1="211.7" y1="346.9" x2="197.6" y2="354.5" stroke="rgba(32,216,236,0.53)" stroke-width="1.6"/>
<line x1="208.6" y1="340.7" x2="203.2" y2="343.1" stroke="rgba(32,216,236,0.71)" stroke-width="1.6"/>
<line x1="206.0" y1="334.2" x2="200.4" y2="336.3" stroke="rgba(32,216,236,0.56)" stroke-width="1.6"/>
<line x1="203.9" y1="327.6" x2="182.7" y2="333.6" stroke="rgba(32,216,236,0.57)" stroke-width="1.6"/>
<line x1="202.2" y1="320.8" x2="180.7" y2="325.4" stroke="rgba(32,216,236,0.57)" stroke-width="1.6"/>
<line x1="201.0" y1="313.9" x2="185.1" y2="316.1" stroke="rgba(32,216,236,0.88)" stroke-width="1.6"/>
<line x1="200.2" y1="307.0" x2="192.3" y2="307.5" stroke="rgba(32,216,236,0.82)" stroke-width="1.6"/>
<line x1="200.0" y1="300.0" x2="192.0" y2="300.0" stroke="rgba(32,216,236,0.68)" stroke-width="1.6"/>
<line x1="200.2" y1="293.0" x2="186.3" y2="292.0" stroke="rgba(32,216,236,0.46)" stroke-width="1.6"/>
<line x1="201.0" y1="286.1" x2="189.1" y2="284.4" stroke="rgba(32,216,236,0.64)" stroke-width="1.6"/>
<line x1="202.2" y1="279.2" x2="196.3" y2="278.0" stroke="rgba(32,216,236,0.57)" stroke-width="1.6"/>
<line x1="203.9" y1="272.4" x2="196.2" y2="270.2" stroke="rgba(32,216,236,0.92)" stroke-width="1.6"/>
<line x1="206.0" y1="265.8" x2="194.8" y2="261.7" stroke="rgba(32,216,236,0.81)" stroke-width="1.6"/>
<line x1="208.6" y1="259.3" x2="200.5" y2="255.3" stroke="rgba(32,216,236,0.71)" stroke-width="1.6"/>
<line x1="211.7" y1="253.1" x2="197.6" y2="245.5" stroke="rgba(32,216,236,0.53)" stroke-width="1.6"/>
<line x1="215.2" y1="247.0" x2="208.4" y2="242.8" stroke="rgba(32,216,236,0.54)" stroke-width="1.6"/>
<line x1="219.1" y1="241.2" x2="212.6" y2="236.5" stroke="rgba(32,216,236,0.88)" stroke-width="1.6"/>
<line x1="223.4" y1="235.7" x2="209.6" y2="224.2" stroke="rgba(32,216,236,0.65)" stroke-width="1.6"/>
<line x1="228.1" y1="230.5" x2="215.1" y2="218.0" stroke="rgba(32,216,236,0.65)" stroke-width="1.6"/>
<line x1="233.1" y1="225.7" x2="223.7" y2="215.3" stroke="rgba(32,216,236,0.88)" stroke-width="1.6"/>
<line x1="238.4" y1="221.2" x2="233.5" y2="214.9" stroke="rgba(32,216,236,0.78)" stroke-width="1.6"/>
<line x1="244.1" y1="217.1" x2="235.1" y2="203.8" stroke="rgba(32,216,236,0.68)" stroke-width="1.6"/>
<line x1="250.0" y1="213.4" x2="247.0" y2="208.2" stroke="rgba(32,216,236,0.71)" stroke-width="1.6"/>
<line x1="256.2" y1="210.1" x2="253.5" y2="204.7" stroke="rgba(32,216,236,0.57)" stroke-width="1.6"/>
<line x1="262.5" y1="207.3" x2="260.3" y2="201.7" stroke="rgba(32,216,236,0.92)" stroke-width="1.6"/>
<line x1="269.1" y1="204.9" x2="263.5" y2="187.8" stroke="rgba(32,216,236,0.68)" stroke-width="1.6"/>
<line x1="275.8" y1="203.0" x2="273.9" y2="195.2" stroke="rgba(32,216,236,0.68)" stroke-width="1.6"/>
<line x1="282.6" y1="201.5" x2="281.2" y2="193.6" stroke="rgba(32,216,236,0.78)" stroke-width="1.6"/>
<line x1="289.5" y1="200.5" x2="287.2" y2="178.7" stroke="rgba(32,216,236,0.62)" stroke-width="1.6"/>
<line x1="296.5" y1="200.1" x2="296.2" y2="190.1" stroke="rgba(32,216,236,0.88)" stroke-width="1.6"/>
<line x1="303.5" y1="200.1" x2="303.8" y2="192.1" stroke="rgba(32,216,236,0.85)" stroke-width="1.6"/>
<line x1="310.5" y1="200.5" x2="312.8" y2="178.7" stroke="rgba(32,216,236,0.92)" stroke-width="1.6"/>
<line x1="317.4" y1="201.5" x2="318.8" y2="193.6" stroke="rgba(32,216,236,0.62)" stroke-width="1.6"/>
<line x1="324.2" y1="203.0" x2="326.1" y2="195.2" stroke="rgba(32,216,236,0.51)" stroke-width="1.6"/>
<line x1="330.9" y1="204.9" x2="336.5" y2="187.8" stroke="rgba(32,216,236,0.73)" stroke-width="1.6"/>
<line x1="337.5" y1="207.3" x2="345.7" y2="186.9" stroke="rgba(32,216,236,0.59)" stroke-width="1.6"/>
<line x1="343.8" y1="210.1" x2="349.1" y2="199.3" stroke="rgba(32,216,236,0.91)" stroke-width="1.6"/>
<line x1="350.0" y1="213.4" x2="353.0" y2="208.2" stroke="rgba(32,216,236,0.64)" stroke-width="1.6"/>
<line x1="355.9" y1="217.1" x2="363.7" y2="205.5" stroke="rgba(32,216,236,0.79)" stroke-width="1.6"/>
<line x1="361.6" y1="221.2" x2="365.3" y2="216.5" stroke="rgba(32,216,236,0.57)" stroke-width="1.6"/>
<line x1="366.9" y1="225.7" x2="381.6" y2="209.3" stroke="rgba(32,216,236,0.50)" stroke-width="1.6"/>
<line x1="371.9" y1="230.5" x2="380.6" y2="222.2" stroke="rgba(32,216,236,0.48)" stroke-width="1.6"/>
<line x1="376.6" y1="235.7" x2="385.8" y2="228.0" stroke="rgba(32,216,236,0.82)" stroke-width="1.6"/>
<line x1="380.9" y1="241.2" x2="385.8" y2="237.7" stroke="rgba(32,216,236,0.82)" stroke-width="1.6"/>
<line x1="384.8" y1="247.0" x2="395.0" y2="240.6" stroke="rgba(32,216,236,0.92)" stroke-width="1.6"/>
<line x1="388.3" y1="253.1" x2="402.4" y2="245.5" stroke="rgba(32,216,236,0.81)" stroke-width="1.6"/>
<line x1="391.4" y1="259.3" x2="400.5" y2="255.3" stroke="rgba(32,216,236,0.51)" stroke-width="1.6"/>
<line x1="394.0" y1="265.8" x2="401.5" y2="263.1" stroke="rgba(32,216,236,0.71)" stroke-width="1.6"/>
<line x1="396.1" y1="272.4" x2="407.7" y2="269.1" stroke="rgba(32,216,236,0.90)" stroke-width="1.6"/>
<line x1="397.8" y1="279.2" x2="419.3" y2="274.6" stroke="rgba(32,216,236,0.73)" stroke-width="1.6"/>
<line x1="399.0" y1="286.1" x2="410.9" y2="284.4" stroke="rgba(32,216,236,0.57)" stroke-width="1.6"/>
<line x1="399.8" y1="293.0" x2="405.7" y2="292.6" stroke="rgba(32,216,236,0.71)" stroke-width="1.6"/>
    <!-- inner detail tick ring (r=50) -->
<line x1="351.3" y1="300.0" x2="355.0" y2="300.0" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="351.3" y1="304.5" x2="354.8" y2="304.8" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="350.7" y1="308.9" x2="354.2" y2="309.6" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="347.3" y1="312.7" x2="353.1" y2="314.2" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="348.4" y1="317.6" x2="351.7" y2="318.8" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="346.7" y1="321.8" x2="349.8" y2="323.2" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="342.4" y1="324.5" x2="347.6" y2="327.5" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="342.2" y1="329.5" x2="345.1" y2="331.5" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="339.5" y1="333.1" x2="342.1" y2="335.4" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="334.6" y1="334.6" x2="338.9" y2="338.9" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="333.1" y1="339.5" x2="335.4" y2="342.1" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="329.5" y1="342.2" x2="331.5" y2="345.1" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="324.5" y1="342.4" x2="327.5" y2="347.6" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="321.8" y1="346.7" x2="323.2" y2="349.8" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="317.6" y1="348.4" x2="318.8" y2="351.7" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="312.7" y1="347.3" x2="314.2" y2="353.1" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="308.9" y1="350.7" x2="309.6" y2="354.2" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="304.5" y1="351.3" x2="304.8" y2="354.8" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="300.0" y1="349.0" x2="300.0" y2="355.0" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="295.5" y1="351.3" x2="295.2" y2="354.8" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="291.1" y1="350.7" x2="290.4" y2="354.2" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="287.3" y1="347.3" x2="285.8" y2="353.1" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="282.4" y1="348.4" x2="281.2" y2="351.7" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="278.2" y1="346.7" x2="276.8" y2="349.8" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="275.5" y1="342.4" x2="272.5" y2="347.6" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="270.5" y1="342.2" x2="268.5" y2="345.1" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="266.9" y1="339.5" x2="264.6" y2="342.1" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="265.4" y1="334.6" x2="261.1" y2="338.9" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="260.5" y1="333.1" x2="257.9" y2="335.4" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="257.8" y1="329.5" x2="254.9" y2="331.5" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="257.6" y1="324.5" x2="252.4" y2="327.5" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="253.3" y1="321.8" x2="250.2" y2="323.2" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="251.6" y1="317.6" x2="248.3" y2="318.8" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="252.7" y1="312.7" x2="246.9" y2="314.2" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="249.3" y1="308.9" x2="245.8" y2="309.6" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="248.7" y1="304.5" x2="245.2" y2="304.8" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="251.0" y1="300.0" x2="245.0" y2="300.0" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="248.7" y1="295.5" x2="245.2" y2="295.2" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="249.3" y1="291.1" x2="245.8" y2="290.4" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="252.7" y1="287.3" x2="246.9" y2="285.8" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="251.6" y1="282.4" x2="248.3" y2="281.2" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="253.3" y1="278.2" x2="250.2" y2="276.8" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="257.6" y1="275.5" x2="252.4" y2="272.5" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="257.8" y1="270.5" x2="254.9" y2="268.5" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="260.5" y1="266.9" x2="257.9" y2="264.6" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="265.4" y1="265.4" x2="261.1" y2="261.1" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="266.9" y1="260.5" x2="264.6" y2="257.9" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="270.5" y1="257.8" x2="268.5" y2="254.9" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="275.5" y1="257.6" x2="272.5" y2="252.4" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="278.2" y1="253.3" x2="276.8" y2="250.2" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="282.4" y1="251.6" x2="281.2" y2="248.3" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="287.3" y1="252.7" x2="285.8" y2="246.9" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="291.1" y1="249.3" x2="290.4" y2="245.8" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="295.5" y1="248.7" x2="295.2" y2="245.2" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="300.0" y1="251.0" x2="300.0" y2="245.0" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="304.5" y1="248.7" x2="304.8" y2="245.2" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="308.9" y1="249.3" x2="309.6" y2="245.8" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="312.7" y1="252.7" x2="314.2" y2="246.9" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="317.6" y1="251.6" x2="318.8" y2="248.3" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="321.8" y1="253.3" x2="323.2" y2="250.2" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="324.5" y1="257.6" x2="327.5" y2="252.4" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="329.5" y1="257.8" x2="331.5" y2="254.9" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="333.1" y1="260.5" x2="335.4" y2="257.9" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="334.6" y1="265.4" x2="338.9" y2="261.1" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="339.5" y1="266.9" x2="342.1" y2="264.6" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="342.2" y1="270.5" x2="345.1" y2="268.5" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="342.4" y1="275.5" x2="347.6" y2="272.5" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="346.7" y1="278.2" x2="349.8" y2="276.8" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="348.4" y1="282.4" x2="351.7" y2="281.2" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="347.3" y1="287.3" x2="353.1" y2="285.8" stroke="rgba(32,216,236,.75)" stroke-width="1.4"/>
<line x1="350.7" y1="291.1" x2="354.2" y2="290.4" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
<line x1="351.3" y1="295.5" x2="354.8" y2="295.2" stroke="rgba(32,216,236,.38)" stroke-width="0.8"/>
    <!-- inner r=25 detail ring -->
<line x1="325.0" y1="300.0" x2="330.0" y2="300.0" stroke="rgba(125,240,255,.8)" stroke-width="1.3"/>
<line x1="326.9" y1="302.8" x2="329.8" y2="303.1" stroke="rgba(125,240,255,.42)" stroke-width="0.7"/>
<line x1="326.4" y1="305.6" x2="329.3" y2="306.2" stroke="rgba(125,240,255,.42)" stroke-width="0.7"/>
<line x1="321.7" y1="312.5" x2="326.0" y2="315.0" stroke="rgba(125,240,255,.8)" stroke-width="1.3"/>
<line x1="312.5" y1="321.7" x2="315.0" y2="326.0" stroke="rgba(125,240,255,.8)" stroke-width="1.3"/>
<line x1="300.0" y1="325.0" x2="300.0" y2="330.0" stroke="rgba(125,240,255,.8)" stroke-width="1.3"/>
<line x1="287.5" y1="321.7" x2="285.0" y2="326.0" stroke="rgba(125,240,255,.8)" stroke-width="1.3"/>
<line x1="278.3" y1="312.5" x2="274.0" y2="315.0" stroke="rgba(125,240,255,.8)" stroke-width="1.3"/>
<line x1="275.0" y1="300.0" x2="270.0" y2="300.0" stroke="rgba(125,240,255,.8)" stroke-width="1.3"/>
<line x1="278.3" y1="287.5" x2="274.0" y2="285.0" stroke="rgba(125,240,255,.8)" stroke-width="1.3"/>
<line x1="287.5" y1="278.3" x2="285.0" y2="274.0" stroke="rgba(125,240,255,.8)" stroke-width="1.3"/>
<line x1="300.0" y1="275.0" x2="300.0" y2="270.0" stroke="rgba(125,240,255,.8)" stroke-width="1.3"/>
<line x1="312.5" y1="278.3" x2="315.0" y2="274.0" stroke="rgba(125,240,255,.8)" stroke-width="1.3"/>
<line x1="321.7" y1="287.5" x2="326.0" y2="285.0" stroke="rgba(125,240,255,.8)" stroke-width="1.3"/>
  </g>

  <!-- ring at r=55 solid -->
  <g class="sp3"><circle cx="300" cy="300" r="55" fill="none" stroke="rgba(32,216,236,.18)" stroke-width="8"/></g>

  <!-- dotted ring r=44 -->
  <circle cx="300" cy="300" r="44" fill="none" stroke="rgba(32,216,236,.38)" stroke-width="1" stroke-dasharray="1 2.5"/>

  <!-- detailed inner core -->
  <path d="M 339.39,306.95 A 40,40 0 0,1 306.95,339.39" fill="none" stroke="rgba(32,216,236,.74)" stroke-width="1.5" stroke-linecap="butt"/>
  <path d="M 293.05,339.39 A 40,40 0 0,1 260.61,306.95" fill="none" stroke="rgba(32,216,236,.74)" stroke-width="1.5" stroke-linecap="butt"/>
  <path d="M 260.61,293.05 A 40,40 0 0,1 293.05,260.61" fill="none" stroke="rgba(32,216,236,.74)" stroke-width="1.5" stroke-linecap="butt"/>
  <path d="M 306.95,260.61 A 40,40 0 0,1 339.39,293.05" fill="none" stroke="rgba(32,216,236,.74)" stroke-width="1.5" stroke-linecap="butt"/>
  <circle cx="300" cy="300" r="35" fill="none" stroke="rgba(32,216,236,.32)" stroke-width="1" stroke-dasharray="1 2.5"/>
  <path d="M 329.71,304.18 A 30,30 0 0,1 303.14,329.84" fill="none" stroke="rgba(32,216,236,.86)" stroke-width="2" stroke-linecap="butt" stroke-dasharray="18 5"/>
  <path d="M 295.82,329.71 A 30,30 0 0,1 270.16,303.14" fill="none" stroke="rgba(32,216,236,.86)" stroke-width="2" stroke-linecap="butt" stroke-dasharray="18 5"/>
  <path d="M 270.29,295.82 A 30,30 0 0,1 296.86,270.16" fill="none" stroke="rgba(32,216,236,.86)" stroke-width="2" stroke-linecap="butt" stroke-dasharray="18 5"/>
  <path d="M 304.18,270.29 A 30,30 0 0,1 329.84,296.86" fill="none" stroke="rgba(32,216,236,.86)" stroke-width="2" stroke-linecap="butt" stroke-dasharray="18 5"/>
  <line x1="322.00" y1="300.00" x2="330.00" y2="300.00" stroke="rgba(32,216,236,.35)" stroke-width="1"/>
  <line x1="315.56" y1="315.56" x2="321.21" y2="321.21" stroke="rgba(32,216,236,.35)" stroke-width="1"/>
  <line x1="300.00" y1="322.00" x2="300.00" y2="330.00" stroke="rgba(32,216,236,.35)" stroke-width="1"/>
  <line x1="284.44" y1="315.56" x2="278.79" y2="321.21" stroke="rgba(32,216,236,.35)" stroke-width="1"/>
  <line x1="278.00" y1="300.00" x2="270.00" y2="300.00" stroke="rgba(32,216,236,.35)" stroke-width="1"/>
  <line x1="284.44" y1="284.44" x2="278.79" y2="278.79" stroke="rgba(32,216,236,.35)" stroke-width="1"/>
  <line x1="300.00" y1="278.00" x2="300.00" y2="270.00" stroke="rgba(32,216,236,.35)" stroke-width="1"/>
  <line x1="315.56" y1="284.44" x2="321.21" y2="278.79" stroke="rgba(32,216,236,.35)" stroke-width="1"/>
  <path d="M 284.44,284.44 A 22,22 0 1,1 284.44,315.56" fill="none" stroke="rgba(32,216,236,.98)" stroke-width="4.5" stroke-linecap="butt"/>
  <path d="M 283.15,314.14 A 22,22 0 0,1 283.15,285.86" fill="none" stroke="rgba(32,216,236,.42)" stroke-width="1.5" stroke-linecap="butt"/>
  <circle cx="300" cy="300" r="19" fill="#010a0e"/>
  <circle cx="300" cy="300" r="19" fill="none" stroke="rgba(125,240,255,.9)" stroke-width="1.5"/>
  <path d="M 315.45,304.14 A 16,16 0 0,1 304.14,315.45" fill="none" stroke="rgba(125,240,255,.80)" stroke-width="1.2" stroke-linecap="butt"/>
  <path d="M 295.86,315.45 A 16,16 0 0,1 284.55,304.14" fill="none" stroke="rgba(125,240,255,.80)" stroke-width="1.2" stroke-linecap="butt"/>
  <path d="M 284.55,295.86 A 16,16 0 0,1 295.86,284.55" fill="none" stroke="rgba(125,240,255,.80)" stroke-width="1.2" stroke-linecap="butt"/>
  <path d="M 304.14,284.55 A 16,16 0 0,1 315.45,295.86" fill="none" stroke="rgba(125,240,255,.80)" stroke-width="1.2" stroke-linecap="butt"/>
  <line x1="311.50" y1="300.00" x2="314.00" y2="300.00" stroke="rgba(125,240,255,.8)" stroke-width="1.1"/>
  <line x1="300.00" y1="311.50" x2="300.00" y2="314.00" stroke="rgba(125,240,255,.8)" stroke-width="1.1"/>
  <line x1="288.50" y1="300.00" x2="286.00" y2="300.00" stroke="rgba(125,240,255,.8)" stroke-width="1.1"/>
  <line x1="300.00" y1="288.50" x2="300.00" y2="286.00" stroke="rgba(125,240,255,.8)" stroke-width="1.1"/>
  <circle cx="300" cy="300" r="11" fill="none" stroke="rgba(125,240,255,.5)" stroke-width="1"/>
  <line x1="304.00" y1="300.00" x2="310.00" y2="300.00" stroke="rgba(125,240,255,.5)" stroke-width="0.8"/>
  <line x1="300.00" y1="304.00" x2="300.00" y2="310.00" stroke="rgba(125,240,255,.5)" stroke-width="0.8"/>
  <line x1="296.00" y1="300.00" x2="290.00" y2="300.00" stroke="rgba(125,240,255,.5)" stroke-width="0.8"/>
  <line x1="300.00" y1="296.00" x2="300.00" y2="290.00" stroke="rgba(125,240,255,.5)" stroke-width="0.8"/>
  <circle cx="300" cy="300" r="9" fill="url(#hotEye)" filter="url(#glow)"/>
  <circle cx="300" cy="300" r="6" fill="none" stroke="rgba(125,240,255,.4)" stroke-width="3.5"/>
  <circle cx="300" cy="300" r="4.5" fill="#c8f8ff"/>
  <circle cx="300" cy="300" r="2" fill="#ffffff"/>

  <!-- outer depth vignette -->
  <circle cx="300" cy="300" r="300" fill="url(#vigRing)"/>
</svg>`

export default function HomeScreen({ onOpenCockpit }) {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
  const [financeText, setFinanceText]   = useState('—')
  const [trainingText, setTrainingText] = useState('WK --/10')
  const [recoveryText, setRecoveryText] = useState('—')
  const [calendarText, setCalendarText] = useState('— EVT')
  const [recoveryOk, setRecoveryOk]     = useState(true)

  const [dockResponse, setDockResponse] = useState(
    'Good afternoon, Diogo. Systems are nominal.'
  )
  const [chatOpen, setChatOpen]   = useState(false)
  const [chatState, setChatState] = useState('standing by')
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages]   = useState([
    { who: 'phoenix', text: 'I am online. Hold the reactor to speak, or type below.' },
  ])

  const [reactorMode, setReactorMode] = useState('') // '' | 'listening' | 'responding' | 'speaking'

  const streamRef          = useRef(null)
  const holdingRef         = useRef(false)
  const recognitionRef     = useRef(null)
  const finalTranscriptRef = useRef('')

  // ── Clock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    }, 15000)
    return () => clearInterval(id)
  }, [])

  // ── Side stats ───────────────────────────────────────────────────────────
  useEffect(() => {
    getFinanceSummary()
      .then(r => {
        const sleeves  = r?.sleeve_summary || []
        const outCount = sleeves.filter(s => s.band_status !== 'within_band').length
        setFinanceText(outCount === 0 ? 'IN BAND' : `${outCount} OUT`)
      })
      .catch(() => setFinanceText('—'))

    getTrainingStatus()
      .then(r => {
        const week  = r?.dunk_goal?.current_mesocycle_week ?? '--'
        const total = 10
        setTrainingText(`WK ${String(week).padStart(2, '0')}/${total}`)
        const warn = r?.fatigue_warning
        setRecoveryText(warn ? 'FATIGUE' : 'NOMINAL')
        setRecoveryOk(!warn)
      })
      .catch(() => { setTrainingText('WK --/10'); setRecoveryText('—') })

    getCrossDomainAlerts()
      .then(r => {
        const n = r?.alerts?.length ?? 0
        setCalendarText(`${n} EVT`)
      })
      .catch(() => setCalendarText('5 EVT'))
  }, [])

  // ── Morning greeting TTS (once on mount) ─────────────────────────────────
  useEffect(() => {
    const h = new Date().getHours()
    const tod = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
    const timer = setTimeout(() => {
      speak(`Good ${tod}, Diogo. Systems are nominal.`)
    }, 1500)
    return () => clearTimeout(timer)
  }, [])

  // ── Auto-scroll chat stream ───────────────────────────────────────────────
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [messages])

  // ── Speech ───────────────────────────────────────────────────────────────
  function startListening() {
    if (holdingRef.current) return
    holdingRef.current     = true
    finalTranscriptRef.current = ''
    setReactorMode('listening')
    setChatState('listening')
    setChatOpen(true)

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setChatState('type instead — speech API unavailable')
      holdingRef.current = false
      setReactorMode('')
      return
    }

    const rec = new SR()
    rec.lang             = 'en-US'
    rec.interimResults   = true
    rec.continuous       = false
    recognitionRef.current = rec

    rec.onresult = e => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscriptRef.current += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      const shown = finalTranscriptRef.current || interim
      if (shown) setChatState('hearing: ' + shown.slice(0, 28))
    }

    rec.onerror = () => {
      holdingRef.current = false
      setReactorMode('')
      setChatState('mic permission needed — type below')
    }

    rec.onend = () => {
      const text = finalTranscriptRef.current.trim()
      finalTranscriptRef.current = ''
      holdingRef.current = false
      setReactorMode('')
      if (text) {
        sendMessage(text)
      } else {
        const fallback = "I didn't catch that. Hold the reactor and speak again, or type here."
        setMessages(prev => [...prev, { who: 'phoenix', text: fallback }])
        setChatState('standing by')
      }
    }

    try { rec.start() } catch (e) {
      holdingRef.current = false
      setReactorMode('')
      setChatState('mic permission needed')
    }
  }

  function stopListening() {
    if (!holdingRef.current) return
    try { recognitionRef.current?.stop() } catch (e) {}
  }

  // ── Chat ─────────────────────────────────────────────────────────────────
  async function sendMessage(text) {
    const clean = (text || '').trim()
    if (!clean) return

    setMessages(prev => [...prev, { who: 'user', text: clean }])
    setReactorMode('responding')
    setChatState('responding')
    setChatOpen(true)

    try {
      const r     = await postJarvisChat({ domain: 'home', message: clean })
      const reply = r?.response || 'I am here.'
      setMessages(prev => [...prev, { who: 'phoenix', text: reply }])
      setDockResponse(reply)
      setReactorMode('speaking')
      setChatState('speaking')
      speak(reply, {
        onEnd: () => {
          setReactorMode('')
          setChatState('standing by')
        },
      })
    } catch {
      const err = 'Connection error. Try again.'
      setMessages(prev => [...prev, { who: 'phoenix', text: err }])
      setReactorMode('')
      setChatState('standing by')
    }
  }

  function handleSend() {
    const t = chatInput.trim()
    if (!t) return
    setChatInput('')
    sendMessage(t)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="phoenix-home">
      {/* Background layers */}
      <div className="bg-deep" />
      <div className="rays" />
      <div className="beams" />
      <div className="hexfield" />

      {/* Circuit decoration */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 2, pointerEvents: 'none', opacity: 0.55 }}
        dangerouslySetInnerHTML={{ __html: CIRCUIT_SVG }}
      />

      <div className="grain" />
      <div className="vignette" />
      <div className="hc tl" /><div className="hc tr" />
      <div className="hc bl" /><div className="hc br" />

      {/* Top bar */}
      <div className="top">
        <div>PHOENIX <span className="v">v2</span></div>
        <div className="r">{time} · <span className="v">ONLINE</span></div>
      </div>

      {/* Side stats */}
      <div className="side l up">
        FINANCE<br />
        <span className="v">{financeText}</span><br />
        <span className="bar"><span className="barfill" style={{ width: 22 }} /></span>
      </div>
      <div className="side l dn">
        TRAINING<br />
        <span className="g">{trainingText}</span><br />
        <span className="bar"><span className="barfill" style={{ width: 10 }} /></span>
      </div>
      <div className="side r up">
        RECOVERY<br />
        <span className={recoveryOk ? 'v' : 'red'}>{recoveryText}</span><br />
        <span className="bar"><span className="barfill" style={{ width: 20 }} /></span>
      </div>
      <div className="side r dn">
        CALENDAR<br />
        <span className="v">{calendarText}</span><br />
        <span className="bar"><span className="barfill" style={{ width: 15 }} /></span>
      </div>

      {/* Main screen */}
      <div className="screen">
        {/* Arc reactor */}
        <div
          className={`orbit${reactorMode ? ' ' + reactorMode : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Hold the reactor to speak with PHOENIX"
          title="hold to speak"
          onPointerDown={e => { e.preventDefault(); startListening() }}
          onPointerUp={e => { e.preventDefault(); stopListening() }}
          onPointerCancel={stopListening}
          onPointerLeave={stopListening}
          onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !holdingRef.current) { e.preventDefault(); startListening() } }}
          onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stopListening() } }}
        >
          <div dangerouslySetInnerHTML={{ __html: ARC_REACTOR_SVG }} />
        </div>

        {/* Wordmark */}
        <div className="nameblock">
          <div className="name-wrap">
            <span className="name">PHOENIX</span>
          </div>
          <div className="sub">Personal Heuristic Operating Engine</div>
        </div>

        {/* Response dock */}
        <div className="dock">
          <div className="resp">
            <b>PHOENIX:</b> {dockResponse}<span className="cursor" />
          </div>
          <div className={`listen${reactorMode ? ' ' + reactorMode : ''}`}>
            <div className="wf">
              <i /><i /><i /><i /><i /><i /><i />
            </div>
            {reactorMode === 'listening'
              ? 'LISTENING…'
              : reactorMode === 'responding'
              ? 'PHOENIX RESPONDING'
              : reactorMode === 'speaking'
              ? 'PHOENIX SPEAKING'
              : 'hold to speak'}
          </div>
        </div>
      </div>

      {/* Chat dock */}
      <div className={`chat-dock${chatOpen ? ' open' : ''}`}>
        <div className="chat-head">
          <div>
            <div className="chat-title">PHOENIX CHAT</div>
            <div className="chat-state">{chatState}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="chat-close"
              onClick={() => stopSpeaking()}
              title="Stop audio"
              style={{ fontSize: 14 }}
            >
              ⬛
            </button>
            <button className="chat-close" onClick={() => setChatOpen(false)}>×</button>
          </div>
        </div>
        <div className="chat-stream" ref={streamRef}>
          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.who}`}>
              <div className="chat-bubble">
                <span className="chat-label">{msg.who === 'user' ? 'YOU' : 'PHOENIX'}</span>
                {msg.text}
              </div>
            </div>
          ))}
        </div>
        <div className="chat-input-row">
          <input
            className="chat-input"
            placeholder="TYPE TO PHOENIX…"
            value={chatInput}
            autoComplete="off"
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
          />
          <button className="chat-send" onClick={handleSend}>SEND</button>
        </div>
      </div>

      {/* Cockpit link → opens chat tab */}
      {!chatOpen && (
        <button className="cockpit-link" onClick={onOpenCockpit}>
          Open Cockpit
        </button>
      )}
    </div>
  )
}
