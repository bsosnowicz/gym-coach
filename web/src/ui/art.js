// Mascots and scenes as SVG strings — one source for the React components,
// the kit files (kit/mascots/*.svg, kit/scenes/*.svg) and the asset tiles.
// Contract: viewBox 0 0 200 200, class="mascot mascot--<id>", colours only via
// f-* / st-* classes, animated groups positioned by coordinates (no transform="").

const face = {
  // shared mouth geometry builder: lips line + open "jaw" mouth whose top edge is flat
  lips: (cx, y, w = 12) => `<g class="m-lips"><path class="ln st-ink w4" d="M${cx - w} ${y} Q${cx} ${y + 8} ${cx + w} ${y}"/></g>`,
  mouth: (cx, y, w = 13, h = 20) => `<g class="m-mouth">
      <path class="f-ink st-ink w3" d="M${cx - w} ${y} L${cx + w} ${y} Q${cx + w} ${y + h} ${cx} ${y + h} Q${cx - w} ${y + h} ${cx - w} ${y} Z"/>
      <rect class="f-face" x="${cx - w + 3}" y="${y + 1.5}" width="${2 * w - 6}" height="4" rx="2"/>
      <ellipse class="f-clay" cx="${cx}" cy="${y + h - 5}" rx="${w * 0.55}" ry="4"/>
    </g>`,
};

export const MASCOTS = [
  {
    id: "trener",
    name: "Trener",
    trait: "Kettlebell z gwizdkiem. Spokojny, konkretny, liczy każdą serię.",
    svg: `<svg class="mascot mascot--trener" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Trener — kettlebell z opaską i gwizdkiem">
  <g class="m-shadow"><ellipse class="f-ink" cx="100" cy="188" rx="54" ry="7"/></g>
  <g class="m-tilt">
    <g class="m-body">
      <path class="f-body st-ink w4" d="M58 98 C46 22 154 22 142 98 L124 94 C132 48 68 48 76 94 Z"/>
      <ellipse class="f-ink2" cx="80" cy="182" rx="12" ry="5"/>
      <ellipse class="f-ink2" cx="120" cy="182" rx="12" ry="5"/>
      <path class="f-body st-ink w4" d="M46 146 C40 108 62 78 100 78 C138 78 160 108 154 146 C151 168 140 180 126 180 L74 180 C60 180 49 168 46 146 Z"/>
      <path class="f-face" d="M64 104 C72 92 84 87 94 86 C84 92 76 100 71 112 Z" opacity=".35"/>
      <path class="f-soft st-ink w4" d="M51 104 C70 88 130 88 149 104 L152 117 C130 101 70 101 48 117 Z"/>
      <path class="f-soft st-ink w3" d="M147 108 L166 102 L162 116 Z"/>
      <path class="f-soft st-ink w3" d="M149 112 L170 120 L158 126 Z"/>
      <path class="f-face st-ink w3" d="M60 146 C60 126 78 116 100 116 C122 116 140 126 140 146 C140 166 122 177 100 177 C78 177 60 166 60 146 Z"/>
      <ellipse class="f-clay cheek" cx="73" cy="156" rx="7" ry="4"/>
      <ellipse class="f-clay cheek" cx="127" cy="156" rx="7" ry="4"/>
      <g class="m-brows">
        <path class="ln st-ink w4" d="M76 128 Q85 122 94 126"/>
        <path class="ln st-ink w4" d="M106 126 Q115 122 124 128"/>
      </g>
      <g class="m-eyes">
        <g class="m-look">
          <ellipse class="f-ink" cx="86" cy="142" rx="6.5" ry="8.5"/>
          <ellipse class="f-ink" cx="114" cy="142" rx="6.5" ry="8.5"/>
          <circle class="f-face" cx="88.5" cy="138.5" r="2.2"/>
          <circle class="f-face" cx="116.5" cy="138.5" r="2.2"/>
        </g>
      </g>
      <g class="m-eyes-closed">
        <path class="ln st-ink w4" d="M78 143 Q86 149 94 143"/>
        <path class="ln st-ink w4" d="M106 143 Q114 149 122 143"/>
      </g>
      <g class="m-eyes-happy">
        <path class="ln st-ink w5" d="M78 145 Q86 133 94 145"/>
        <path class="ln st-ink w5" d="M106 145 Q114 133 122 145"/>
      </g>
      ${face.lips(100, 158, 10)}
      ${face.mouth(100, 156, 11, 17)}
      <path class="ln st-ink2 w2" d="M140 96 C150 112 154 128 152 146"/>
      <rect class="f-clay st-ink w3" x="141" y="146" width="22" height="13" rx="6"/>
      <rect class="f-clay st-ink w3" x="158" y="148" width="9" height="7" rx="2"/>
      <circle class="f-ink" cx="149" cy="152.5" r="2.5"/>
    </g>
  </g>
</svg>`,
  },
  {
    id: "talerz",
    name: "Talerz",
    trait: "Krążek 20 kg w czapce. Pogodny, cierpliwy, lubi technikę.",
    svg: `<svg class="mascot mascot--talerz" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Talerz — krążek obciążeniowy w czapce z daszkiem">
  <g class="m-shadow"><ellipse class="f-ink" cx="100" cy="188" rx="50" ry="7"/></g>
  <g class="m-tilt">
    <g class="m-body">
      <path class="ln st-ink w8" d="M84 172 L82 184"/><path class="ln st-ink2 w3" d="M84 172 L82 184"/>
      <path class="ln st-ink w8" d="M116 172 L118 184"/><path class="ln st-ink2 w3" d="M116 172 L118 184"/>
      <ellipse class="f-ink2" cx="78" cy="185" rx="10" ry="4.5"/>
      <ellipse class="f-ink2" cx="122" cy="185" rx="10" ry="4.5"/>
      <circle class="f-body st-ink w4" cx="100" cy="112" r="68"/>
      <circle class="ln st-face w2" cx="100" cy="112" r="58" opacity=".35"/>
      <circle class="f-face" cx="56" cy="92" r="4"/>
      <circle class="f-face" cx="144" cy="92" r="4"/>
      <circle class="f-face" cx="56" cy="136" r="4"/>
      <circle class="f-face" cx="144" cy="136" r="4"/>
      <path class="f-soft st-ink w4" d="M50 70 C58 30 142 30 150 70 C120 62 80 62 50 70 Z"/>
      <path class="f-soft st-ink w4" d="M54 68 C40 64 26 68 20 78 C34 80 46 78 58 72 Z"/>
      <circle class="f-ink" cx="100" cy="40" r="4"/>
      <circle class="f-face st-ink w4" cx="100" cy="116" r="42"/>
      <ellipse class="f-clay cheek" cx="74" cy="128" rx="7" ry="4"/>
      <ellipse class="f-clay cheek" cx="126" cy="128" rx="7" ry="4"/>
      <g class="m-brows">
        <path class="ln st-ink w4" d="M76 96 Q85 90 94 94"/>
        <path class="ln st-ink w4" d="M106 94 Q115 90 124 96"/>
      </g>
      <g class="m-eyes">
        <g class="m-look">
          <ellipse class="f-ink" cx="86" cy="110" rx="6.5" ry="8.5"/>
          <ellipse class="f-ink" cx="114" cy="110" rx="6.5" ry="8.5"/>
          <circle class="f-face" cx="88.5" cy="106.5" r="2.2"/>
          <circle class="f-face" cx="116.5" cy="106.5" r="2.2"/>
        </g>
      </g>
      <g class="m-eyes-closed">
        <path class="ln st-ink w4" d="M78 111 Q86 117 94 111"/>
        <path class="ln st-ink w4" d="M106 111 Q114 117 122 111"/>
      </g>
      <g class="m-eyes-happy">
        <path class="ln st-ink w5" d="M78 113 Q86 101 94 113"/>
        <path class="ln st-ink w5" d="M106 113 Q114 101 122 113"/>
      </g>
      ${face.lips(100, 128, 10)}
      ${face.mouth(100, 126, 11, 18)}
    </g>
  </g>
</svg>`,
  },
  {
    id: "szejk",
    name: "Szejk",
    trait: "Szejker białkowy. Energiczny, motywuje, pilnuje regeneracji.",
    svg: `<svg class="mascot mascot--szejk" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Szejk — szejker białkowy napinający biceps">
  <g class="m-shadow"><ellipse class="f-ink" cx="100" cy="188" rx="46" ry="7"/></g>
  <g class="m-tilt">
    <g class="m-body">
      <path class="ln st-ink w8" d="M60 128 L44 150"/><path class="ln st-face w3" d="M60 128 L44 150"/>
      <circle class="f-face st-ink w3" cx="42" cy="153" r="7"/>
      <path class="ln st-ink w8" d="M140 126 L160 116 L158 96"/><path class="ln st-face w3" d="M140 126 L160 116 L158 96"/>
      <circle class="f-face st-ink w3" cx="158" cy="92" r="8"/>
      <rect class="f-face st-ink w4" x="58" y="62" width="84" height="120" rx="20"/>
      <path class="f-soft" d="M62 132 C80 123 96 138 116 129 C128 124 134 126 138 128 L138 162 Q138 178 122 178 L78 178 Q62 178 62 162 Z"/>
      <path class="ln st-ink w3" d="M62 132 C80 123 96 138 116 129 C128 124 134 126 138 128"/>
      <circle class="f-face" cx="84" cy="152" r="4"/>
      <circle class="f-face" cx="110" cy="164" r="3"/>
      <circle class="f-face" cx="122" cy="146" r="2.5"/>
      <path class="ln st-ink2 w2" d="M126 80 L134 80 M128 92 L134 92 M126 104 L134 104"/>
      <rect class="f-body st-ink w4" x="86" y="24" width="28" height="18" rx="7"/>
      <rect class="f-body st-ink w4" x="52" y="40" width="96" height="28" rx="11"/>
      <path class="ln st-face w3" d="M62 50 L96 50" opacity=".5"/>
      <ellipse class="f-clay cheek" cx="72" cy="108" rx="7" ry="4"/>
      <ellipse class="f-clay cheek" cx="122" cy="108" rx="7" ry="4"/>
      <g class="m-brows">
        <path class="ln st-ink w4" d="M74 80 Q83 74 92 78"/>
        <path class="ln st-ink w4" d="M104 78 Q113 74 122 80"/>
      </g>
      <g class="m-eyes">
        <g class="m-look">
          <ellipse class="f-ink" cx="84" cy="93" rx="6" ry="8"/>
          <ellipse class="f-ink" cx="112" cy="93" rx="6" ry="8"/>
          <circle class="f-face" cx="86.3" cy="89.6" r="2"/>
          <circle class="f-face" cx="114.3" cy="89.6" r="2"/>
        </g>
      </g>
      <g class="m-eyes-closed">
        <path class="ln st-ink w4" d="M77 94 Q84 100 91 94"/>
        <path class="ln st-ink w4" d="M105 94 Q112 100 119 94"/>
      </g>
      <g class="m-eyes-happy">
        <path class="ln st-ink w5" d="M77 96 Q84 85 91 96"/>
        <path class="ln st-ink w5" d="M105 96 Q112 85 119 96"/>
      </g>
      ${face.lips(98, 110, 9)}
      ${face.mouth(98, 108, 10, 16)}
    </g>
  </g>
</svg>`,
  },
];

// Scenes: 480 × 320 art, sliced to the stage (xMidYMax slice), layers react to state classes.
const sceneSvg = (id, label, back, mid) => `<svg class="scene-art scene-art--${id}" viewBox="0 0 480 320" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">
  <g class="s-back">${back}</g>
  <g class="s-light">
    <ellipse class="sc-glow" cx="240" cy="210" rx="150" ry="96" opacity=".22"/>
  </g>
  <g class="s-mid">${mid}</g>
  <g class="s-listen">
    <path class="ln sc-st-glow w4" d="M150 150 Q138 170 150 190"/>
    <path class="ln sc-st-glow w4" d="M136 140 Q118 170 136 200"/>
    <path class="ln sc-st-glow w4" d="M330 150 Q342 170 330 190"/>
    <path class="ln sc-st-glow w4" d="M344 140 Q362 170 344 200"/>
  </g>
  <g class="s-think">
    <circle class="sc-cream sc-st-ink w2" cx="300" cy="122" r="7"/>
    <circle class="sc-cream sc-st-ink w2" cx="318" cy="102" r="9"/>
    <circle class="sc-cream sc-st-ink w2" cx="342" cy="80" r="12"/>
  </g>
  <g class="s-fx">
    <path class="sc-glow sc-st-ink w2" d="M120 90 l5 12 l12 5 l-12 5 l-5 12 l-5 -12 l-12 -5 l12 -5 Z"/>
    <path class="sc-glow sc-st-ink w2" d="M356 70 l4 9 l9 4 l-9 4 l-4 9 l-4 -9 l-9 -4 l9 -4 Z"/>
    <path class="sc-clay sc-st-ink w2" d="M372 150 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 Z"/>
    <path class="sc-clay sc-st-ink w2" d="M96 170 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 Z"/>
    <circle class="sc-glow" cx="150" cy="60" r="4"/>
    <circle class="sc-clay" cx="330" cy="120" r="3.5"/>
  </g>
  <rect class="s-dim sc-ink" x="0" y="0" width="480" height="320"/>
</svg>`;

export const SCENES = [
  {
    id: "silownia",
    name: "Siłownia",
    svg: sceneSvg("silownia", "Siłownia: stojak z hantlami, klatka do przysiadów, gumowa podłoga",
      `<rect class="sc-sky" x="0" y="0" width="480" height="320"/>
       <rect class="sc-far" x="0" y="0" width="480" height="18"/>
       <rect class="sc-glow" x="0" y="118" width="480" height="10" opacity=".55"/>
       <rect class="sc-far" x="24" y="40" width="10" height="210"/><rect class="sc-far" x="446" y="40" width="10" height="210"/>
       <circle class="sc-cream" cx="120" cy="18" r="10"/><circle class="sc-cream" cx="240" cy="18" r="10"/><circle class="sc-cream" cx="360" cy="18" r="10"/>
       <rect class="sc-floor" x="0" y="248" width="480" height="72"/>
       <path class="ln sc-st-near w2" d="M0 272 L480 272 M0 298 L480 298 M80 248 L60 320 M200 248 L196 320 M320 248 L324 320 M420 248 L440 320"/>`,
      `<rect class="sc-near" x="40" y="168" width="96" height="8" rx="3"/>
       <rect class="sc-near" x="40" y="210" width="96" height="8" rx="3"/>
       <rect class="sc-near" x="46" y="176" width="6" height="74"/><rect class="sc-near" x="124" y="176" width="6" height="74"/>
       <g class="sc-ink"><rect x="54" y="152" width="8" height="16" rx="3"/><rect x="68" y="152" width="8" height="16" rx="3"/><rect x="100" y="150" width="9" height="18" rx="3"/><rect x="116" y="150" width="9" height="18" rx="3"/>
       <rect x="54" y="194" width="9" height="16" rx="3"/><rect x="70" y="194" width="9" height="16" rx="3"/><rect x="98" y="192" width="10" height="18" rx="3"/><rect x="114" y="192" width="10" height="18" rx="3"/></g>
       <rect class="sc-near" x="352" y="70" width="10" height="180"/><rect class="sc-near" x="420" y="70" width="10" height="180"/>
       <rect class="sc-near" x="346" y="66" width="90" height="8" rx="3"/>
       <rect class="sc-ink" x="330" y="128" width="124" height="5" rx="2"/>
       <rect class="sc-ink" x="334" y="114" width="12" height="34" rx="4"/><rect class="sc-ink" x="438" y="114" width="12" height="34" rx="4"/>
       <rect class="sc-glow" x="320" y="118" width="10" height="24" rx="3"/><rect class="sc-glow" x="454" y="118" width="10" height="24" rx="3"/>`),
  },
  {
    id: "dom",
    name: "Dom",
    svg: sceneSvg("dom", "Trening w domu: salon z oknem, roślina, kanapa i mata",
      `<rect class="sc-sky" x="0" y="0" width="480" height="320"/>
       <rect class="sc-far" x="300" y="40" width="130" height="120" rx="8"/>
       <rect class="sc-cream" x="310" y="50" width="52" height="100" rx="4"/><rect class="sc-cream" x="368" y="50" width="52" height="100" rx="4"/>
       <circle class="sc-glow" cx="396" cy="78" r="12" opacity=".8"/>
       <rect class="sc-floor" x="0" y="244" width="480" height="76"/>
       <path class="ln sc-st-near w2" d="M0 262 L480 262"/>
       <rect class="sc-far" x="40" y="60" width="70" height="52" rx="4"/><rect class="sc-cream" x="46" y="66" width="58" height="40" rx="2"/>
       <path class="sc-near" d="M54 100 L70 82 L82 94 L92 86 L100 100 Z"/>`,
      `<rect class="sc-near" x="16" y="178" width="132" height="66" rx="16"/>
       <rect class="sc-far" x="26" y="158" width="112" height="40" rx="14"/>
       <rect class="sc-ink" x="28" y="242" width="8" height="10" rx="2"/><rect class="sc-ink" x="128" y="242" width="8" height="10" rx="2"/>
       <rect class="sc-clay" x="414" y="206" width="36" height="40" rx="6"/>
       <path class="sc-near" d="M432 208 C410 180 404 158 416 140 C426 160 430 176 432 208 Z"/>
       <path class="sc-near" d="M432 208 C440 172 456 156 470 150 C466 176 452 196 432 208 Z"/>
       <path class="sc-near" d="M432 208 C424 172 432 140 446 124 C450 154 444 184 432 208 Z"/>
       <path class="sc-glow" d="M150 286 L330 286 L350 312 L130 312 Z" opacity=".9"/>
       <path class="ln sc-st-ink w2" d="M150 286 L330 286 L350 312 L130 312 Z" opacity=".25"/>`),
  },
  {
    id: "plener",
    name: "Plener",
    svg: sceneSvg("plener", "Plener: drążki do street workoutu, drzewa, słońce",
      `<rect class="sc-sky" x="0" y="0" width="480" height="320"/>
       <circle class="sc-glow" cx="388" cy="62" r="30" opacity=".85"/>
       <path class="sc-far" d="M0 196 L40 160 L76 176 L120 140 L168 172 L220 150 L270 176 L320 146 L372 170 L420 152 L480 180 L480 250 L0 250 Z"/>
       <rect class="sc-floor" x="0" y="246" width="480" height="74"/>
       <path class="ln sc-st-near w2" d="M0 266 Q240 256 480 266"/>`,
      `<circle class="sc-near" cx="58" cy="150" r="40"/><circle class="sc-near" cx="94" cy="168" r="30"/>
       <rect class="sc-ink" x="70" y="176" width="8" height="72" rx="3"/>
       <path class="ln sc-st-ink w8" d="M330 248 L330 110 M440 248 L440 110 M384 248 L384 150"/>
       <path class="ln sc-st-ink w6" d="M322 110 L448 110 M322 150 L392 150"/>
       <rect class="sc-glow" x="326" y="236" width="8" height="12"/><rect class="sc-glow" x="436" y="236" width="8" height="12"/>
       <circle class="sc-near" cx="440" cy="232" r="0"/>`),
  },
];

export const mascotById = (id) => MASCOTS.find((m) => m.id === id) || MASCOTS[0];
export const sceneById = (id) => SCENES.find((s) => s.id === id) || SCENES[0];
