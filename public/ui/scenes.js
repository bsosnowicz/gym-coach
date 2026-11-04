// The stage backdrops for voice mode, from language-coach (designed in Claude Design) until Gym Coach has its own. Needs css/scene.css.

export const SCENES = {
  pracownia: { name: 'Pracownia', svg: `<svg class="scene scene--pracownia" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" data-label="Pracownia">
  <rect class="s-wall" width="1600" height="900"></rect>
  <path class="s-warm" d="M540 570 V430 A260 260 0 0 1 1060 430 V570 Z"></path>

  <g class="s-window">
    <circle class="s-shade" cx="300" cy="290" r="130"></circle>
    <circle class="s-white s-ol" cx="290" cy="280" r="128"></circle>
    <circle class="s-warm" cx="290" cy="280" r="100"></circle>
    <circle class="s-clay" cx="334" cy="318" r="32"></circle>
    <g class="s-cloud">
      <rect class="s-white" x="212" y="232" width="92" height="28" rx="14"></rect>
      <circle class="s-white" cx="246" cy="232" r="20"></circle>
      <circle class="s-white" cx="274" cy="238" r="14"></circle>
    </g>
    <path class="s-line s-st-white" d="M290 182 V378 M192 280 H388"></path>
    <circle class="s-line s-ol" cx="290" cy="280" r="100"></circle>
  </g>

  <g class="s-shelf">
    <rect class="s-white s-ol" x="1310" y="196" width="40" height="104" rx="8"></rect>
    <rect class="s-clay" x="1313" y="218" width="34" height="10"></rect>
    <rect class="s-clay s-ol" x="1356" y="176" width="36" height="124" rx="8"></rect>
    <rect class="s-slate s-ol" x="1398" y="206" width="42" height="94" rx="8"></rect>
    <path class="s-warm s-ol" d="M1452 300 L1490 300 L1528 214 L1492 200 Z"></path>
    <rect class="s-clay s-ol" x="1288" y="300" width="256" height="20" rx="10"></rect>
    <rect class="s-clay s-ol" x="1310" y="440" width="122" height="30" rx="8"></rect>
    <rect class="s-white s-ol" x="1322" y="412" width="102" height="28" rx="8"></rect>
    <circle class="s-warm s-ol" cx="1488" cy="414" r="34"></circle>
    <ellipse class="s-meridian s-line s-ol s-thin" cx="1488" cy="414" rx="16" ry="34"></ellipse>
    <path class="s-line s-ol s-thin" d="M1454 414 H1522 M1488 448 V470"></path>
    <rect class="s-clay s-ol" x="1288" y="470" width="256" height="20" rx="10"></rect>
  </g>

  <g class="s-floor">
    <rect class="s-clay" x="-20" y="660" width="1640" height="260"></rect>
    <rect class="s-white s-ol" x="-20" y="560" width="1640" height="102"></rect>
    <rect class="s-warm s-ol" x="-20" y="662" width="1640" height="24"></rect>
    <rect class="s-shade" x="-20" y="686" width="1640" height="18"></rect>
  </g>

  <g class="s-plant">
    <g class="s-sway">
      <path class="s-clay s-ol s-thin" d="M300 482 C268 442 228 432 206 446 C232 478 268 488 300 482 Z"></path>
      <path class="s-clay s-ol s-thin" d="M300 482 C332 442 372 432 394 446 C368 478 332 488 300 482 Z"></path>
      <path class="s-warm s-ol s-thin" d="M300 482 C292 422 300 362 322 322 C336 372 324 432 300 482 Z"></path>
      <path class="s-clay s-ol s-thin" d="M300 482 C250 452 236 392 250 352 C290 382 306 432 300 482 Z"></path>
      <path class="s-clay s-ol s-thin" d="M300 482 C350 452 366 394 350 354 C312 384 296 432 300 482 Z"></path>
    </g>
    <path class="s-white s-ol" d="M248 490 H352 L340 570 Q338 582 326 582 H274 Q262 582 260 570 Z"></path>
    <rect class="s-clay s-ol" x="240" y="476" width="120" height="24" rx="12"></rect>
  </g>

  <g class="s-mug">
    <path class="s-steam s-steam-1 s-line s-st-steam" d="M432 512 q-5 -7 0 -14 q5 -7 0 -14"></path>
    <path class="s-steam s-steam-2 s-line s-st-steam" d="M448 512 q-5 -7 0 -14 q5 -7 0 -14"></path>
    <path class="s-line s-ol" d="M462 534 Q476 534 476 546 Q476 558 462 558"></path>
    <path class="s-white s-ol" d="M418 524 H462 V556 Q462 572 446 572 H434 Q418 572 418 556 Z"></path>
    <rect class="s-clay" x="421" y="534" width="38" height="8"></rect>
  </g>

  <g class="s-mic">
    <path class="s-line s-st-slate s-thick" d="M1240 548 V432 L1186 352"></path>
    <rect class="s-slate" x="1220" y="540" width="40" height="30" rx="8"></rect>
    <circle class="s-slate" cx="1240" cy="432" r="13"></circle>
    <rect class="s-slate s-ol" x="1150" y="348" width="64" height="112" rx="32"></rect>
    <path class="s-line s-st-white s-w4" d="M1164 382 H1200 M1164 402 H1200 M1164 422 H1200"></path>
    <rect class="s-clay" x="1150" y="436" width="64" height="10"></rect>
  </g>

  <g class="s-onair">
    <path class="s-line s-ol s-thin" d="M756 0 V74 M844 0 V74"></path>
    <rect class="s-onair-glow" x="712" y="66" width="176" height="76" rx="38"></rect>
    <rect class="s-onair-box s-ol" x="720" y="74" width="160" height="60" rx="30"></rect>
    <rect class="s-onair-mic" x="789" y="86" width="22" height="34" rx="11"></rect>
    <path class="s-onair-icon" d="M762 92 Q752 104 762 116 M838 92 Q848 104 838 116"></path>
    <path class="s-onair-icon s-onair-far" d="M744 84 Q728 104 744 124 M856 84 Q872 104 856 124"></path>
  </g>
  <rect class="s-dim" width="1600" height="900"></rect>
</svg>` },
  kawiarnia: { name: 'Kawiarnia', svg: `<svg class="scene scene--kawiarnia" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" data-label="Kawiarnia">
  <rect class="s-wall" width="1600" height="900"></rect>
  <rect class="s-warm" x="-10" y="440" width="1620" height="130"></rect>
  <path class="s-line s-ol s-thin" d="M-10 440 H1610"></path>
  <g class="s-bigwindow">
    <rect class="s-shade" x="572" y="222" width="480" height="230" rx="26"></rect>
    <rect class="s-white s-ol" x="560" y="210" width="480" height="232" rx="26"></rect>
    <rect class="s-warm" x="582" y="232" width="436" height="196" rx="14"></rect>
    <rect class="s-clay s-ol" x="546" y="430" width="508" height="20" rx="10"></rect>
  </g>

  <g class="s-lamps">
    <g class="s-swing s-swing-1">
      <path class="s-line s-ol s-thin" d="M400 0 V116"></path>
      <ellipse class="s-white" cx="400" cy="153" rx="16" ry="8"></ellipse>
      <path class="s-clay s-ol" d="M354 150 Q354 110 400 110 Q446 110 446 150 Z"></path>
    </g>
    <g class="s-swing s-swing-2">
      <path class="s-line s-ol s-thin" d="M620 0 V70"></path>
      <ellipse class="s-white" cx="620" cy="107" rx="16" ry="8"></ellipse>
      <path class="s-clay s-ol" d="M574 104 Q574 64 620 64 Q666 64 666 104 Z"></path>
    </g>
    <g class="s-swing s-swing-3">
      <path class="s-line s-ol s-thin" d="M980 0 V70"></path>
      <ellipse class="s-white" cx="980" cy="107" rx="16" ry="8"></ellipse>
      <path class="s-clay s-ol" d="M934 104 Q934 64 980 64 Q1026 64 1026 104 Z"></path>
    </g>
    <g class="s-swing s-swing-4">
      <path class="s-line s-ol s-thin" d="M1200 0 V116"></path>
      <ellipse class="s-white" cx="1200" cy="153" rx="16" ry="8"></ellipse>
      <path class="s-clay s-ol" d="M1154 150 Q1154 110 1200 110 Q1246 110 1246 150 Z"></path>
    </g>
  </g>

  <g class="s-shelf">
    <path class="s-line s-ol s-thin" d="M184 302 Q196 302 196 310 Q196 318 184 318"></path>
    <path class="s-white s-ol" d="M150 296 H186 V316 Q186 330 172 330 H164 Q150 330 150 316 Z"></path>
    <path class="s-line s-ol s-thin" d="M240 302 Q252 302 252 310 Q252 318 240 318"></path>
    <path class="s-white s-ol" d="M206 296 H242 V316 Q242 330 228 330 H220 Q206 330 206 316 Z"></path>
    <rect class="s-clay s-ol" x="258" y="252" width="62" height="16" rx="8"></rect>
    <rect class="s-warm s-ol" x="262" y="266" width="54" height="64" rx="14"></rect>
    <circle class="s-clay" cx="280" cy="300" r="6"></circle>
    <circle class="s-clay" cx="297" cy="312" r="6"></circle>
    <circle class="s-clay" cx="296" cy="290" r="5"></circle>
    <g class="s-sway">
      <path class="s-clay s-ol s-thin" d="M362 300 C346 286 344 268 352 256 C366 266 368 284 362 300 Z"></path>
      <path class="s-warm s-ol s-thin" d="M362 300 C368 280 382 270 394 270 C392 286 380 298 362 300 Z"></path>
    </g>
    <path class="s-white s-ol" d="M340 296 H384 L378 324 Q377 330 371 330 H353 Q347 330 346 324 Z"></path>
    <rect class="s-clay s-ol" x="130" y="330" width="276" height="18" rx="9"></rect>
  </g>

  <g class="s-floor">
    <rect class="s-clay" x="-20" y="660" width="1640" height="260"></rect>
    <path class="s-line s-ol s-thin s-faint" d="M60 704 V900 M180 704 V900 M300 704 V900 M420 704 V900 M540 704 V900 M660 704 V900 M780 704 V900 M900 704 V900 M1020 704 V900 M1140 704 V900 M1260 704 V900 M1380 704 V900 M1500 704 V900"></path>
    <rect class="s-white s-ol" x="-20" y="560" width="1640" height="102"></rect>
    <rect class="s-warm s-ol" x="-20" y="662" width="1640" height="24"></rect>
    <rect class="s-shade" x="-20" y="686" width="1640" height="18"></rect>
  </g>

  <g class="s-espresso">
    <rect class="s-shade" x="168" y="564" width="214" height="14" rx="7"></rect>
    <g class="s-steamers">
    <path class="s-steam s-steam-1 s-line s-st-steam" d="M202 352 q-5 -7 0 -14 q5 -7 0 -14"></path>
    <path class="s-steam s-steam-1 s-line s-st-steam" d="M254 352 q-5 -7 0 -14 q5 -7 0 -14"></path>
    </g>
    <path class="s-line s-ol s-thin" d="M218 364 Q230 364 230 372 Q230 380 218 380"></path>
    <path class="s-white s-ol" d="M184 358 H220 V378 Q220 392 206 392 H198 Q184 392 184 378 Z"></path>
    <path class="s-line s-ol s-thin" d="M270 364 Q282 364 282 372 Q282 380 270 380"></path>
    <path class="s-white s-ol" d="M236 358 H272 V378 Q272 392 258 392 H250 Q236 392 236 378 Z"></path>
    <rect class="s-clay s-ol" x="172" y="392" width="196" height="22" rx="10"></rect>
    <rect class="s-slate s-ol" x="160" y="410" width="220" height="162" rx="24"></rect>
    <rect class="s-wall" x="180" y="428" width="180" height="46" rx="14"></rect>
    <circle class="s-white s-ol s-thin" cx="222" cy="451" r="16"></circle>
    <circle class="s-white s-ol s-thin" cx="318" cy="451" r="16"></circle>
    <path class="s-needle s-needle-1 s-line s-st-navy s-w4" d="M222 451 V439"></path>
    <path class="s-needle s-needle-2 s-line s-st-navy s-w4" d="M318 451 V439"></path>
    <circle class="s-accent" cx="270" cy="451" r="6"></circle>
    <rect class="s-navy" x="250" y="482" width="40" height="20" rx="6"></rect>
    <path class="s-line s-st-navy s-w10" d="M292 498 H336"></path>
    <circle class="s-drip s-navy" cx="270" cy="510" r="3.5"></circle>
    <rect class="s-clay s-ol s-thin" x="214" y="556" width="112" height="12" rx="6"></rect>
    <path class="s-white s-ol s-thin" d="M254 528 H286 V544 Q286 556 272 556 H268 Q254 556 254 544 Z"></path>
    <path class="s-line s-st-slate s-w8" d="M378 470 Q398 476 398 518"></path>
  </g>

  <g class="s-menu">
    <circle class="s-slate" cx="1270" cy="186" r="6"></circle>
    <circle class="s-slate" cx="1440" cy="186" r="6"></circle>
    <rect class="s-slate s-ol" x="1230" y="190" width="250" height="210" rx="20"></rect>
    <path class="s-cream-o" d="M1262 222 H1292 V238 Q1292 248 1282 248 H1272 Q1262 248 1262 238 Z"></path>
    <path class="s-line s-st-cream s-w4" d="M1292 228 Q1300 228 1300 234 Q1300 240 1292 240"></path>
    <path class="s-line s-st-cream s-w10" d="M1264 304 Q1278 282 1292 304"></path>
    <path class="s-cream-o" d="M1264 362 Q1264 336 1292 334 Q1292 362 1264 362 Z"></path>
    <rect class="s-cream-o" x="1316" y="232" width="88" height="8" rx="4"></rect>
    <rect class="s-cream-o" x="1316" y="292" width="72" height="8" rx="4"></rect>
    <rect class="s-cream-o" x="1316" y="348" width="80" height="8" rx="4"></rect>
    <rect class="s-clay" x="1414" y="226" width="44" height="20" rx="10"></rect>
    <rect class="s-clay" x="1414" y="286" width="44" height="20" rx="10"></rect>
    <rect class="s-clay" x="1414" y="342" width="44" height="20" rx="10"></rect>
  </g>

  <g class="s-cake">
    <ellipse class="s-white s-ol" cx="1210" cy="574" rx="74" ry="10"></ellipse>
    <rect class="s-clay s-ol" x="1166" y="522" width="88" height="48" rx="12"></rect>
    <path class="s-white" d="M1169 538 Q1182 548 1194 538 Q1208 548 1222 538 Q1236 548 1251 538 V532 Q1251 525 1244 525 H1176 Q1169 525 1169 532 Z"></path>
    <circle class="s-accent" cx="1210" cy="515" r="7"></circle>
    <path class="s-glass s-ol s-thin" d="M1144 572 Q1144 462 1210 458 Q1276 462 1276 572 Z"></path>
    <circle class="s-white s-ol s-thin" cx="1210" cy="452" r="9"></circle>
  </g>

  <g class="s-plant">
    <g class="s-sway">
      <path class="s-clay s-ol s-thin" d="M1446 516 C1420 496 1404 470 1410 446 C1436 456 1450 486 1446 516 Z"></path>
      <path class="s-clay s-ol s-thin" d="M1446 516 C1472 496 1488 470 1482 446 C1456 456 1442 486 1446 516 Z"></path>
      <path class="s-warm s-ol s-thin" d="M1446 516 C1440 484 1446 452 1462 428 C1472 456 1464 490 1446 516 Z"></path>
    </g>
    <path class="s-white s-ol" d="M1410 520 H1482 L1474 566 Q1473 574 1465 574 H1427 Q1419 574 1418 566 Z"></path>
    <rect class="s-clay s-ol" x="1404" y="508" width="84" height="18" rx="9"></rect>
  </g>

  <g class="s-onair">
    <circle class="s-onair-glow" cx="800" cy="118" r="48"></circle>
    <circle class="s-onair-box s-ol" cx="800" cy="118" r="40"></circle>
    <rect class="s-onair-mic" x="790.0" y="99.0" width="20.0" height="30.0" rx="10.0"></rect>
    <path class="s-onair-icon" d="M786.0 122.0 Q786.0 140.0 800 140.0 Q814.0 140.0 814.0 122.0 M800 140.0 V146.0"></path>
  </g>
  <rect class="s-dim" width="1600" height="900"></rect>
</svg>` },
  taras: { name: 'Taras', svg: `<svg class="scene scene--taras" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" data-label="Taras o zachodzie">
  <rect class="s-warm" width="1600" height="900"></rect>
  <circle class="s-cream" cx="800" cy="520" r="300"></circle>
  <circle class="s-clay" cx="800" cy="520" r="210"></circle>
  <g class="s-cloud">
    <rect class="s-cream" x="140" y="250" width="230" height="34" rx="17"></rect>
    <circle class="s-cream" cx="210" cy="250" r="24"></circle>
  </g>
  <g class="s-cloud s-cloud-2">
    <rect class="s-cream" x="1220" y="214" width="260" height="38" rx="19"></rect>
    <circle class="s-cream" cx="1380" cy="214" r="28"></circle>
  </g>
  <g class="s-birds">
    <path class="s-line s-st-slate s-w4" d="M-120 214 q10 -10 20 0 q10 -10 20 0 M-70 196 q8 -8 16 0 q8 -8 16 0 M-40 226 q7 -7 14 0 q7 -7 14 0"></path>
  </g>
  <g class="s-skyline">
    <rect class="s-sky1" x="0" y="300" width="90" height="270" rx="6"></rect>
    <rect class="s-sky1" x="90" y="360" width="70" height="210" rx="6"></rect>
    <rect class="s-sky1" x="160" y="330" width="110" height="240" rx="6"></rect>
    <rect class="s-sky1" x="270" y="400" width="80" height="170" rx="6"></rect>
    <rect class="s-sky1" x="350" y="440" width="120" height="130" rx="6"></rect>
    <rect class="s-sky1" x="470" y="476" width="100" height="94" rx="6"></rect>
    <rect class="s-sky1" x="570" y="500" width="140" height="70" rx="6"></rect>
    <rect class="s-sky1" x="710" y="486" width="90" height="84" rx="6"></rect>
    <rect class="s-sky1" x="800" y="506" width="120" height="64" rx="6"></rect>
    <rect class="s-sky1" x="920" y="480" width="100" height="90" rx="6"></rect>
    <rect class="s-sky1" x="1020" y="496" width="110" height="74" rx="6"></rect>
    <rect class="s-sky1" x="1130" y="430" width="100" height="140" rx="6"></rect>
    <rect class="s-sky1" x="1230" y="380" width="90" height="190" rx="6"></rect>
    <rect class="s-sky1" x="1320" y="320" width="120" height="250" rx="6"></rect>
    <rect class="s-sky1" x="1440" y="360" width="80" height="210" rx="6"></rect>
    <rect class="s-sky1" x="1520" y="300" width="100" height="270" rx="6"></rect>
    <rect class="s-sky2" x="40" y="380" width="120" height="190" rx="6"></rect>
    <rect class="s-win" x="58" y="402" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="88" y="402" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="118" y="402" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="58" y="436" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="88" y="436" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="118" y="436" width="14" height="18" rx="3"></rect>
    <rect class="s-win s-win-t s-win-t2" x="58" y="470" width="14" height="18" rx="3"></rect>
    <rect class="s-win s-win-t s-win-t3" x="88" y="470" width="14" height="18" rx="3"></rect>
    <rect class="s-win s-win-t s-win-t0" x="118" y="470" width="14" height="18" rx="3"></rect>
    <rect class="s-sky2" x="200" y="420" width="90" height="150" rx="6"></rect>
    <rect class="s-win s-win-t s-win-t0" x="218" y="442" width="14" height="18" rx="3"></rect>
    <rect class="s-win s-win-t s-win-t1" x="248" y="442" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="218" y="476" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="248" y="476" width="14" height="18" rx="3"></rect>
    <rect class="s-sky2" x="1290" y="400" width="110" height="170" rx="6"></rect>
    <rect class="s-win" x="1308" y="422" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1338" y="422" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1368" y="422" width="14" height="18" rx="3"></rect>
    <rect class="s-win s-win-t s-win-t3" x="1308" y="456" width="14" height="18" rx="3"></rect>
    <rect class="s-win s-win-t s-win-t0" x="1338" y="456" width="14" height="18" rx="3"></rect>
    <rect class="s-win s-win-t s-win-t1" x="1368" y="456" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1308" y="490" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1338" y="490" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1368" y="490" width="14" height="18" rx="3"></rect>
    <rect class="s-sky2" x="1430" y="350" width="140" height="220" rx="6"></rect>
    <rect class="s-win" x="1448" y="372" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1478" y="372" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1508" y="372" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1538" y="372" width="14" height="18" rx="3"></rect>
    <rect class="s-win s-win-t s-win-t0" x="1448" y="406" width="14" height="18" rx="3"></rect>
    <rect class="s-win s-win-t s-win-t1" x="1478" y="406" width="14" height="18" rx="3"></rect>
    <rect class="s-win s-win-t s-win-t2" x="1508" y="406" width="14" height="18" rx="3"></rect>
    <rect class="s-win s-win-t s-win-t3" x="1538" y="406" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1448" y="440" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1478" y="440" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1508" y="440" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1538" y="440" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1448" y="474" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1478" y="474" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1508" y="474" width="14" height="18" rx="3"></rect>
    <rect class="s-win" x="1538" y="474" width="14" height="18" rx="3"></rect>
  </g>
  <g class="s-railing">
    <rect class="s-glass" x="-20" y="508" width="1640" height="56"></rect>
    <rect class="s-white s-ol" x="110" y="500" width="22" height="66" rx="6"></rect>
    <rect class="s-white s-ol" x="446" y="500" width="22" height="66" rx="6"></rect>
    <rect class="s-white s-ol" x="1132" y="500" width="22" height="66" rx="6"></rect>
    <rect class="s-white s-ol" x="1468" y="500" width="22" height="66" rx="6"></rect>
    <rect class="s-white s-ol" x="-20" y="494" width="1640" height="16" rx="8"></rect>
  </g>

  <g class="s-floor">
    <rect class="s-clay" x="-20" y="660" width="1640" height="260"></rect>
    <path class="s-line s-ol s-thin s-faint" d="M60 704 V900 M180 704 V900 M300 704 V900 M420 704 V900 M540 704 V900 M660 704 V900 M780 704 V900 M900 704 V900 M1020 704 V900 M1140 704 V900 M1260 704 V900 M1380 704 V900 M1500 704 V900"></path>
    <rect class="s-white s-ol" x="-20" y="560" width="1640" height="102"></rect>
    <rect class="s-warm s-ol" x="-20" y="662" width="1640" height="24"></rect>
    <rect class="s-shade" x="-20" y="686" width="1640" height="18"></rect>
  </g>
  <g class="s-lights">
    <path class="s-line s-ol s-thin" d="M-20 128 Q800 212 1620 128"></path>
    <rect class="s-slate" x="96" y="138.4" width="8" height="10" rx="2"></rect>
    <circle class="s-fairy s-fairy-0" cx="100" cy="157.4" r="10"></circle>
    <rect class="s-slate" x="236" y="149.4" width="8" height="10" rx="2"></rect>
    <circle class="s-fairy s-fairy-1" cx="240" cy="168.4" r="10"></circle>
    <rect class="s-slate" x="376" y="158.0" width="8" height="10" rx="2"></rect>
    <circle class="s-fairy s-fairy-2" cx="380" cy="177.0" r="10"></circle>
    <rect class="s-slate" x="516" y="164.1" width="8" height="10" rx="2"></rect>
    <circle class="s-fairy s-fairy-3" cx="520" cy="183.1" r="10"></circle>
    <rect class="s-slate" x="656" y="167.8" width="8" height="10" rx="2"></rect>
    <circle class="s-fairy s-fairy-4" cx="660" cy="186.8" r="10"></circle>
    <rect class="s-slate" x="796" y="169.0" width="8" height="10" rx="2"></rect>
    <circle class="s-fairy s-fairy-5" cx="800" cy="188.0" r="10"></circle>
    <rect class="s-slate" x="936" y="167.8" width="8" height="10" rx="2"></rect>
    <circle class="s-fairy s-fairy-6" cx="940" cy="186.8" r="10"></circle>
    <rect class="s-slate" x="1076" y="164.1" width="8" height="10" rx="2"></rect>
    <circle class="s-fairy s-fairy-7" cx="1080" cy="183.1" r="10"></circle>
    <rect class="s-slate" x="1216" y="158.0" width="8" height="10" rx="2"></rect>
    <circle class="s-fairy s-fairy-8" cx="1220" cy="177.0" r="10"></circle>
    <rect class="s-slate" x="1356" y="149.4" width="8" height="10" rx="2"></rect>
    <circle class="s-fairy s-fairy-9" cx="1360" cy="168.4" r="10"></circle>
    <rect class="s-slate" x="1496" y="138.4" width="8" height="10" rx="2"></rect>
    <circle class="s-fairy s-fairy-10" cx="1500" cy="157.4" r="10"></circle>
  </g>

  <g class="s-plant">
    <g class="s-sway">
      <path class="s-clay s-ol s-thin" d="M230 510 C170 500 130 450 140 400 C190 400 230 450 230 510 Z"></path>
      <path class="s-clay s-ol s-thin" d="M230 510 C290 500 330 450 320 400 C270 400 230 450 230 510 Z"></path>
      <path class="s-warm s-ol s-thin" d="M230 510 C200 460 200 380 240 330 C270 380 260 460 230 510 Z"></path>
      <path class="s-clay s-ol s-thin" d="M230 510 C180 480 120 480 100 500 C140 530 190 530 230 510 Z"></path>
      <path class="s-clay s-ol s-thin" d="M230 510 C280 480 340 480 360 500 C320 530 270 530 230 510 Z"></path>
    </g>
    <path class="s-white s-ol" d="M170 520 H290 L276 628 Q274 640 262 640 H198 Q186 640 184 628 Z"></path>
    <rect class="s-clay s-ol" x="162" y="506" width="136" height="26" rx="13"></rect>
  </g>

  <g class="s-table">
    <path class="s-line s-st-slate s-thick" d="M1300 534 V606"></path>
    <ellipse class="s-slate" cx="1300" cy="608" rx="40" ry="8"></ellipse>
    <ellipse class="s-white s-ol" cx="1300" cy="520" rx="96" ry="16"></ellipse>
    <path class="s-slate s-ol s-thin" d="M1256 446 L1286 424 L1316 446 Z"></path>
    <circle class="s-line s-ol s-thin" cx="1286" cy="418" r="6"></circle>
    <rect class="s-slate s-ol s-thin" x="1262" y="444" width="48" height="62" rx="10"></rect>
    <rect class="s-cream" x="1271" y="454" width="30" height="42" rx="6"></rect>
    <path class="s-flame s-accent" d="M1286 490 Q1277 480 1286 466 Q1295 480 1286 490 Z"></path>
    <path class="s-steam s-steam-1 s-line s-st-steam" d="M1340 470 q-5 -6 0 -12 q5 -6 0 -12"></path>
    <path class="s-line s-ol s-thin" d="M1362 488 Q1372 488 1372 496 Q1372 504 1362 504"></path>
    <path class="s-white s-ol s-thin" d="M1330 482 H1362 V500 Q1362 510 1352 510 H1340 Q1330 510 1330 500 Z"></path>
  </g>

  <rect class="s-dim" width="1600" height="900"></rect>
</svg>` },
  peron: { name: 'Peron', svg: `<svg class="scene scene--peron" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" data-label="Peron">
  <rect class="s-wall" width="1600" height="900"></rect>
  <defs>
    <clipPath id="s-peron-view"><path d="M132 480 V284 A138 138 0 0 1 408 284 V480 Z"></path></clipPath>
  </defs>
  <path class="s-warm" d="M484 572 V372 A316 210 0 0 1 1116 372 V572 Z"></path>
  <g class="s-pillars">
    <rect class="s-warm s-ol" x="440" y="-10" width="44" height="580"></rect>
    <rect class="s-clay s-ol" x="428" y="150" width="68" height="20" rx="10"></rect>
    <rect class="s-warm s-ol" x="1116" y="-10" width="44" height="580"></rect>
    <rect class="s-clay s-ol" x="1104" y="150" width="68" height="20" rx="10"></rect>
  </g>

  <g class="s-window">
    <path class="s-shade" d="M122 512 V290 A160 160 0 0 1 442 290 V512 Z"></path>
    <path class="s-white s-ol" d="M110 500 V280 A160 160 0 0 1 430 280 V500 Z"></path>
    <path class="s-warm" d="M132 480 V284 A138 138 0 0 1 408 284 V480 Z"></path>
    <g clip-path="url(#s-peron-view)">
      <rect class="s-clay" x="130" y="404" width="60" height="80" rx="6"></rect>
      <rect class="s-clay" x="196" y="380" width="44" height="100" rx="6"></rect>
      <rect class="s-clay" x="300" y="396" width="70" height="90" rx="6"></rect>
      <rect class="s-clay" x="372" y="420" width="40" height="70" rx="6"></rect>
      <circle class="s-cream" cx="320" cy="260" r="26"></circle>
      <g class="s-train">
        <path class="s-white s-ol" d="M-600 360 H-60 Q-10 360 -4 406 Q-10 452 -60 452 H-600 Z"></path>
        <rect class="s-slate" x="-560" y="378" width="48" height="30" rx="8"></rect><rect class="s-slate" x="-488" y="378" width="48" height="30" rx="8"></rect><rect class="s-slate" x="-416" y="378" width="48" height="30" rx="8"></rect><rect class="s-slate" x="-344" y="378" width="48" height="30" rx="8"></rect><rect class="s-slate" x="-272" y="378" width="48" height="30" rx="8"></rect><rect class="s-slate" x="-200" y="378" width="48" height="30" rx="8"></rect><rect class="s-slate" x="-128" y="378" width="48" height="30" rx="8"></rect>
        <path class="s-slate" d="M-52 376 Q-26 380 -20 404 H-60 Q-64 380 -52 376 Z"></path>
        <rect class="s-accent" x="-600" y="428" width="560" height="8"></rect>
      </g>
    </g>
    <path class="s-line s-st-white" d="M270 146 V480 M132 372 H408"></path>
    <path class="s-line s-ol" d="M132 480 V284 A138 138 0 0 1 408 284 V480 Z"></path>
    <rect class="s-clay s-ol" x="96" y="494" width="348" height="18" rx="9"></rect>
  </g>

  <g class="s-clock">
    <path class="s-line s-ol s-thin" d="M800 0 V62"></path>
    <rect class="s-slate" x="786" y="56" width="28" height="14" rx="5"></rect>
    <circle class="s-white s-ol" cx="800" cy="122" r="52"></circle>
    <path class="s-line s-ol s-thin" d="M800 78 V86 M844 122 H836 M800 166 V158 M756 122 H764"></path>
    <path class="s-hand-h s-line s-st-navy s-w6" d="M800 122 V96"></path>
    <path class="s-hand-m s-line s-st-navy s-w4" d="M800 122 V82"></path>
    <circle class="s-navy" cx="800" cy="122" r="5"></circle>
  </g>

  <g class="s-board">
    <rect class="s-shade" x="1200" y="210" width="300" height="150" rx="18"></rect>
    <rect class="s-slate s-ol" x="1190" y="200" width="300" height="150" rx="18"></rect>
    <rect class="s-cream-o" x="1252" y="222" width="200" height="12" rx="6"></rect>
    <rect class="s-flip s-flip-0" x="1214" y="254" width="36" height="22" rx="4"></rect>
    <rect class="s-flip s-flip-1" x="1258" y="254" width="36" height="22" rx="4"></rect>
    <rect class="s-flip s-flip-2" x="1302" y="254" width="36" height="22" rx="4"></rect>
    <rect class="s-flip s-flip-3" x="1346" y="254" width="36" height="22" rx="4"></rect>
    <rect class="s-flip s-flip-4" x="1214" y="284" width="36" height="22" rx="4"></rect>
    <rect class="s-flip s-flip-5" x="1258" y="284" width="36" height="22" rx="4"></rect>
    <rect class="s-flip s-flip-0" x="1302" y="284" width="36" height="22" rx="4"></rect>
    <rect class="s-flip s-flip-1" x="1346" y="284" width="36" height="22" rx="4"></rect>
    <rect class="s-flip s-flip-2" x="1214" y="314" width="36" height="22" rx="4"></rect>
    <rect class="s-flip s-flip-3" x="1258" y="314" width="36" height="22" rx="4"></rect>
    <rect class="s-flip s-flip-4" x="1302" y="314" width="36" height="22" rx="4"></rect>
    <rect class="s-flip s-flip-5" x="1346" y="314" width="36" height="22" rx="4"></rect>
    <rect class="s-clay" x="1400" y="256" width="66" height="18" rx="9"></rect>
    <rect class="s-clay" x="1400" y="286" width="66" height="18" rx="9"></rect>
    <rect class="s-clay" x="1400" y="316" width="66" height="18" rx="9"></rect>
  </g>

  <g class="s-onair">
    <circle class="s-onair-glow" cx="1222" cy="228" r="23"></circle>
    <circle class="s-onair-box s-ol" cx="1222" cy="228" r="15"></circle>
    <rect class="s-onair-mic" x="1218.2" y="220.9" width="7.5" height="11.2" rx="3.8"></rect>
    <path class="s-onair-icon" d="M1216.8 229.5 Q1216.8 236.2 1222 236.2 Q1227.2 236.2 1227.2 229.5 M1222 236.2 V238.5"></path>
  </g>
  <g class="s-floor">
    <rect class="s-warm" x="-20" y="660" width="1640" height="260"></rect>
    <rect class="s-white s-ol" x="-20" y="560" width="1640" height="102"></rect>
    <rect class="s-warm s-ol" x="-20" y="662" width="1640" height="24"></rect>
    <rect class="s-shade" x="-20" y="686" width="1640" height="18"></rect>
  </g>

  <g class="s-suitcase">
    <circle class="s-slate" cx="1190" cy="576" r="7"></circle>
    <circle class="s-slate" cx="1252" cy="576" r="7"></circle>
    <path class="s-line s-ol" d="M1202 478 V456 H1240 V478"></path>
    <rect class="s-clay s-ol" x="1170" y="476" width="102" height="96" rx="16"></rect>
    <path class="s-line s-ol s-thin" d="M1200 482 V566 M1242 482 V566"></path>
    <circle class="s-warm s-ol s-thin" cx="1221" cy="522" r="12"></circle>
  </g>

  <rect class="s-dim" width="1600" height="900"></rect>
</svg>` },
  scena: { name: 'Scena', svg: `<svg class="scene scene--scena" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" data-label="Scena">
  <rect class="s-wall" width="1600" height="900"></rect>
  <rect class="s-warm" x="0" y="600" width="1600" height="300"></rect>
  <path class="s-line s-ol" d="M-10 600 H1610"></path>

  <g class="s-panels">
    <rect class="s-eq s-eq-0 s-clay s-ol" x="130" y="170" width="86" height="86" rx="22"></rect>
    <rect class="s-eq s-eq-1 s-warm s-ol" x="232" y="170" width="86" height="86" rx="22"></rect>
    <rect class="s-eq s-eq-2 s-warm s-ol" x="130" y="272" width="86" height="86" rx="22"></rect>
    <rect class="s-eq s-eq-3 s-clay s-ol" x="232" y="272" width="86" height="86" rx="22"></rect>
    <rect class="s-eq s-eq-4 s-clay s-ol" x="130" y="374" width="86" height="86" rx="22"></rect>
    <rect class="s-eq s-eq-5 s-warm s-ol" x="232" y="374" width="86" height="86" rx="22"></rect>
  </g>

  <g class="s-frame">
    <rect class="s-shade" x="1320" y="310" width="140" height="120" rx="18"></rect>
    <rect class="s-white s-ol" x="1310" y="300" width="140" height="120" rx="18"></rect>
    <rect class="s-warm" x="1328" y="318" width="104" height="84" rx="8"></rect>
    <path class="s-clay" d="M1332 402 L1366 354 L1388 380 L1404 362 L1428 402 Z"></path>
    <circle class="s-white" cx="1408" cy="338" r="9"></circle>
  </g>

  <path class="s-beam" d="M1254 246 L1326 246 L1012 616 L612 616 Z"></path>
  <g class="s-motes">
    <circle class="s-mote s-mote-1 s-white" cx="1196" cy="330" r="4"></circle>
    <circle class="s-mote s-mote-2 s-white" cx="1232" cy="292" r="3"></circle>
    <circle class="s-mote s-mote-3 s-white" cx="1170" cy="372" r="3.5"></circle>
    <circle class="s-mote s-mote-4 s-white" cx="1256" cy="270" r="2.5"></circle>
  </g>

  <g class="s-lamp">
    <path class="s-line s-st-slate s-thick" d="M1500 690 V300 Q1500 198 1400 196 L1300 198"></path>
    <ellipse class="s-slate" cx="1500" cy="692" rx="56" ry="14"></ellipse>
    <ellipse class="s-bulb" cx="1290" cy="242" rx="32" ry="9"></ellipse>
    <path class="s-slate s-ol" d="M1240 242 Q1240 186 1290 186 Q1340 186 1340 242 Z"></path>
  </g>

  <g class="s-plant">
    <g class="s-sway">
      <path class="s-clay s-ol s-thin" d="M330 632 C280 602 262 532 278 482 C320 520 336 580 330 632 Z"></path>
      <path class="s-clay s-ol s-thin" d="M330 632 C380 602 398 534 382 484 C340 522 324 580 330 632 Z"></path>
      <path class="s-warm s-ol s-thin" d="M330 632 C320 562 330 492 354 446 C370 504 356 576 330 632 Z"></path>
      <path class="s-clay s-ol s-thin" d="M330 632 C296 596 250 588 226 602 C254 634 294 642 330 632 Z"></path>
      <path class="s-clay s-ol s-thin" d="M330 632 C364 596 410 588 434 602 C406 634 366 642 330 632 Z"></path>
    </g>
    <path class="s-white s-ol" d="M272 640 H388 L374 740 Q372 752 360 752 H300 Q288 752 286 740 Z"></path>
    <rect class="s-clay s-ol" x="262" y="626" width="136" height="24" rx="12"></rect>
  </g>

  <g class="s-podium">
    <ellipse class="s-shade" cx="800" cy="704" rx="400" ry="52"></ellipse>
    <path class="s-clay s-ol" d="M440 612 V682 A360 56 0 0 0 1160 682 V612 Z"></path>
    <ellipse class="s-white s-ol" cx="800" cy="612" rx="360" ry="56"></ellipse>
  </g>

  <g class="s-onair">
    <path class="s-line s-ol s-thin" d="M800 0 V72"></path>
    <circle class="s-onair-glow" cx="800" cy="112" r="48"></circle>
    <circle class="s-onair-box s-ol" cx="800" cy="112" r="40"></circle>
    <rect class="s-onair-mic" x="790.0" y="93.0" width="20.0" height="30.0" rx="10.0"></rect>
    <path class="s-onair-icon" d="M786.0 116.0 Q786.0 134.0 800 134.0 Q814.0 134.0 814.0 116.0 M800 134.0 V140.0"></path>
  </g>
  <rect class="s-dim" width="1600" height="900"></rect>
</svg>` }
};

export const DEFAULT_SCENE = 'pracownia';

// Puts the backdrop into the host; a new one fades in over the old one (0.6 s).
export function mountScene(host, id = DEFAULT_SCENE) {
  const key = Object.hasOwn(SCENES, id) ? id : DEFAULT_SCENE;
  if (host.dataset.scene === key) return key;
  const old = [...host.querySelectorAll(':scope > .scene-layer')];
  const layer = document.createElement('div');
  layer.className = 'scene-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = SCENES[key].svg;
  const last = old[old.length - 1];
  if (last) last.after(layer); else host.prepend(layer);
  host.dataset.scene = key;
  setTimeout(() => old.forEach((el) => el.remove()), 650);
  return key;
}
