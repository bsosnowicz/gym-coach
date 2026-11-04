// The coach's mascots for voice mode, from language-coach (designed in Claude Design)
// until Gym Coach has its own. Needs css/mascot.css.

export const MASCOTS = {
  trener: { name: 'Trener', svg: `<svg class="mascot mascot--trener" viewBox="0 0 200 200" role="img" aria-label="Trener, maskotka Gym Coach">
  <ellipse class="m-shadow" cx="100" cy="187" rx="46" ry="6"></ellipse>
  <g class="m-tilt">
    <g class="m-body">
      <ellipse class="f-ink" cx="80" cy="179" rx="15" ry="8"></ellipse>
      <ellipse class="f-ink" cx="120" cy="179" rx="15" ry="8"></ellipse>
      <path class="ln st-ink2 w8" d="M47 92 C47 -2 153 -2 153 92"></path>
      <path class="ln st-body w14" d="M56 124 Q40 136 41 154"></path>
      <circle class="f-face st-ink2 w3" cx="41" cy="158" r="7.5"></circle>
      <rect class="f-body" x="52" y="28" width="96" height="146" rx="48"></rect>
      <path class="ln st-clay w4" d="M60 160 Q100 168 140 160"></path>
      <rect class="f-face" x="62" y="50" width="76" height="80" rx="34"></rect>
      <ellipse class="f-clay" cx="73" cy="109" rx="6" ry="4"></ellipse>
      <ellipse class="f-clay" cx="127" cy="109" rx="6" ry="4"></ellipse>
      <g class="m-brows">
        <path class="ln st-ink w5" d="M77 66 Q85 62 93 65"></path>
        <path class="ln st-ink w5" d="M107 65 Q115 62 123 66"></path>
      </g>
      <g class="m-eyes">
        <g class="m-look">
          <ellipse class="f-ink" cx="86" cy="84" rx="7" ry="9"></ellipse>
          <ellipse class="f-ink" cx="114" cy="84" rx="7" ry="9"></ellipse>
          <circle class="f-face" cx="88.5" cy="80.5" r="2.3"></circle>
          <circle class="f-face" cx="116.5" cy="80.5" r="2.3"></circle>
        </g>
      </g>
      <g class="m-eyes-closed">
        <path class="ln st-ink w5" d="M79 85 Q86 91 93 85"></path>
        <path class="ln st-ink w5" d="M107 85 Q114 91 121 85"></path>
      </g>
      <g class="m-eyes-happy">
        <path class="ln st-ink w5" d="M79 87 Q86 77 93 87"></path>
        <path class="ln st-ink w5" d="M107 87 Q114 77 121 87"></path>
      </g>
      <path class="m-lips ln st-ink w5" d="M91.4 108.0 Q100 115.0 108.6 108.0"></path>
      <g class="m-mouth">
        <path class="f-ink" d="M88 102.0 Q100 98.0 112 102.0 Q112 120.0 100 120.0 Q88 120.0 88 102.0 Z"></path>
        <ellipse class="f-body" cx="100" cy="115.5" rx="5.4" ry="3.0"></ellipse>
      </g>
      <rect class="f-ink2" x="37" y="76" width="20" height="34" rx="9"></rect>
      <rect class="f-ink2" x="143" y="76" width="20" height="34" rx="9"></rect>
      <g class="m-arm-r">
        <path class="ln st-body w14" d="M144 124 Q160 136 159 154"></path>
        <circle class="f-face st-ink2 w3" cx="159" cy="158" r="7.5"></circle>
      </g>
      <path class="ln st-ink2 w4" d="M46 108 Q47 127 70 126"></path>
      <rect class="f-ink2" x="68" y="121" width="12" height="9" rx="4.5"></rect>
      <path class="ln st-ink2 w3" d="M78 132 L100 151 L122 132"></path>
      <rect class="f-face st-ink w3" x="90" y="149" width="22" height="12" rx="6"></rect>
      <circle class="f-ink" cx="97" cy="155" r="2.2"></circle>
    </g>
    <g class="m-cup" aria-hidden="true">
      <path class="m-steam ln st-ink2 w3" d="M146 142 q-4 -5 0 -10 q4 -5 0 -10"></path>
      <path class="m-steam m-steam-2 ln st-ink2 w3" d="M156 142 q-4 -5 0 -10 q4 -5 0 -10"></path>
      <path class="ln st-ink w4" d="M165 155 Q176 155 176 162 Q176 170 165 170"></path>
      <path class="f-face st-ink w4" d="M136 148 H166 V164 Q166 178 152 178 H150 Q136 178 136 164 Z"></path>
      <rect class="f-body" x="138.5" y="154" width="25" height="6" rx="2"></rect>
    </g>
  </g>
  <g class="m-listen" aria-hidden="true">
    <path class="ln st-ink2 w4" d="M172 82 Q180 95 172 108"></path>
    <path class="m-listen-2 ln st-ink2 w4" d="M181 74 Q192 95 181 116"></path>
  </g>
  <g class="m-think" aria-hidden="true">
    <circle class="f-face st-ink2 w3" cx="134" cy="38" r="3.5"></circle>
    <circle class="f-face st-ink2 w3" cx="141" cy="30" r="5"></circle>
    <rect class="f-face st-ink2 w3" x="144" y="0" width="50" height="26" rx="13"></rect>
    <circle class="m-dot m-dot-1 f-ink2" cx="157" cy="13" r="3.6"></circle>
    <circle class="m-dot m-dot-2 f-ink2" cx="169" cy="13" r="3.6"></circle>
    <circle class="m-dot m-dot-3 f-ink2" cx="181" cy="13" r="3.6"></circle>
  </g>
  <g class="m-cheer" aria-hidden="true">
    <path class="m-star m-star-1 f-body" d="M22 36 Q23.6 44.4 32 46 Q23.6 47.6 22 56 Q20.4 47.6 12 46 Q20.4 44.4 22 36 Z"></path>
    <path class="m-star m-star-2 f-body" d="M180 124 Q181.3 130.7 188 132 Q181.3 133.3 180 140 Q178.7 133.3 172 132 Q178.7 130.7 180 124 Z"></path>
    <path class="m-star m-star-3 f-ink2" d="M26 114 Q27.0 119.0 32 120 Q27.0 121.0 26 126 Q25.0 121.0 20 120 Q25.0 119.0 26 114 Z"></path>
    <path class="m-star m-star-4 f-ink2" d="M176 54 Q177.0 59.0 182 60 Q177.0 61.0 176 66 Q175.0 61.0 170 60 Q175.0 59.0 176 54 Z"></path>
  </g>
</svg>` },
  dymek: { name: 'Dymek', svg: `<svg class="mascot mascot--dymek" viewBox="0 0 200 200" role="img" aria-label="Dymek, maskotka Gym Coach">
  <ellipse class="m-shadow" cx="100" cy="187" rx="54" ry="6"></ellipse>
  <g class="m-tilt">
    <g class="m-body">
      <path class="f-body" d="M74 34 H126 Q170 34 170 78 V108 Q170 152 126 152 H88 L52 178 Q47 181 49 175 L60 149 Q30 140 30 108 V78 Q30 34 74 34 Z"></path>
      <rect class="f-face" x="46" y="54" width="108" height="78" rx="30"></rect>
      <ellipse class="f-clay" cx="63" cy="111" rx="8" ry="5"></ellipse>
      <ellipse class="f-clay" cx="137" cy="111" rx="8" ry="5"></ellipse>
      <g class="m-brows">
        <path class="ln st-ink w5" d="M70 72 Q79 67 88 71"></path>
        <path class="ln st-ink w5" d="M112 71 Q121 67 130 72"></path>
      </g>
      <g class="m-eyes">
        <g class="m-look">
          <ellipse class="f-ink" cx="80" cy="90" rx="8" ry="10"></ellipse>
          <ellipse class="f-ink" cx="120" cy="90" rx="8" ry="10"></ellipse>
          <circle class="f-face" cx="83" cy="86" r="2.6"></circle>
          <circle class="f-face" cx="123" cy="86" r="2.6"></circle>
        </g>
      </g>
      <g class="m-eyes-closed">
        <path class="ln st-ink w5" d="M72 91 Q80 97 88 91"></path>
        <path class="ln st-ink w5" d="M112 91 Q120 97 128 91"></path>
      </g>
      <g class="m-eyes-happy">
        <path class="ln st-ink w5" d="M72 93 Q80 83 88 93"></path>
        <path class="ln st-ink w5" d="M112 93 Q120 83 128 93"></path>
      </g>
      <path class="m-lips ln st-ink w5" d="M88.5 112.0 Q100 119.0 111.5 112.0"></path>
      <g class="m-mouth">
        <path class="f-ink" d="M84 105.0 Q100 101.0 116 105.0 Q116 125.0 100 125.0 Q84 125.0 84 105.0 Z"></path>
        <ellipse class="f-body" cx="100" cy="120.5" rx="7.2" ry="3.3"></ellipse>
      </g>
    </g>
    <g class="m-cup" aria-hidden="true">
      <path class="m-steam ln st-ink2 w3" d="M146 142 q-4 -5 0 -10 q4 -5 0 -10"></path>
      <path class="m-steam m-steam-2 ln st-ink2 w3" d="M156 142 q-4 -5 0 -10 q4 -5 0 -10"></path>
      <path class="ln st-ink w4" d="M165 155 Q176 155 176 162 Q176 170 165 170"></path>
      <path class="f-face st-ink w4" d="M136 148 H166 V164 Q166 178 152 178 H150 Q136 178 136 164 Z"></path>
      <rect class="f-body" x="138.5" y="154" width="25" height="6" rx="2"></rect>
    </g>
  </g>
  <g class="m-listen" aria-hidden="true">
    <path class="ln st-ink2 w4" d="M180 82 Q188 95 180 108"></path>
    <path class="m-listen-2 ln st-ink2 w4" d="M189 74 Q200 95 189 116"></path>
  </g>
  <g class="m-think" aria-hidden="true">
    <circle class="f-face st-ink2 w3" cx="136" cy="38" r="3.5"></circle>
    <circle class="f-face st-ink2 w3" cx="143" cy="30" r="5"></circle>
    <rect class="f-face st-ink2 w3" x="146" y="0" width="50" height="26" rx="13"></rect>
    <circle class="m-dot m-dot-1 f-ink2" cx="159" cy="13" r="3.6"></circle>
    <circle class="m-dot m-dot-2 f-ink2" cx="171" cy="13" r="3.6"></circle>
    <circle class="m-dot m-dot-3 f-ink2" cx="183" cy="13" r="3.6"></circle>
  </g>
  <g class="m-cheer" aria-hidden="true">
    <path class="m-star m-star-1 f-body" d="M16 21 Q17.4 28.6 25 30 Q17.4 31.4 16 39 Q14.6 31.4 7 30 Q14.6 28.6 16 21 Z"></path>
    <path class="m-star m-star-2 f-body" d="M186 132 Q187.3 138.7 194 140 Q187.3 141.3 186 148 Q184.7 141.3 178 140 Q184.7 138.7 186 132 Z"></path>
    <path class="m-star m-star-3 f-ink2" d="M14 144 Q15.0 149.0 20 150 Q15.0 151.0 14 156 Q13.0 151.0 8 150 Q13.0 149.0 14 144 Z"></path>
    <path class="m-star m-star-4 f-ink2" d="M188 40 Q189.0 45.0 194 46 Q189.0 47.0 188 52 Q187.0 47.0 182 46 Q187.0 45.0 188 40 Z"></path>
  </g>
</svg>` },
  kamyk: { name: 'Kamyk', svg: `<svg class="mascot mascot--kamyk" viewBox="0 0 200 200" role="img" aria-label="Kamyk, maskotka Gym Coach">
  <ellipse class="m-shadow" cx="100" cy="187" rx="62" ry="6"></ellipse>
  <g class="m-tilt">
    <g class="m-body">
      <path class="f-body" d="M92 52 C146 48 178 84 177 124 C176 160 144 178 100 178 C56 178 23 160 24 124 C25 86 48 55 92 52 Z"></path>
      <ellipse class="f-clay" cx="50" cy="130" rx="9" ry="5"></ellipse>
      <ellipse class="f-clay" cx="150" cy="130" rx="9" ry="5"></ellipse>
      <g class="m-brows">
        <path class="ln st-ink w6" d="M60 73 Q72 66 85 71"></path>
        <path class="ln st-ink w6" d="M115 71 Q128 66 140 73"></path>
      </g>
      <circle class="f-face" cx="76" cy="100" r="20"></circle>
      <circle class="f-face" cx="124" cy="100" r="20"></circle>
      <g class="m-eyes">
        <g class="m-look">
          <ellipse class="f-ink" cx="76" cy="101" rx="6.5" ry="8"></ellipse>
          <ellipse class="f-ink" cx="124" cy="101" rx="6.5" ry="8"></ellipse>
          <circle class="f-face" cx="78.5" cy="97.5" r="2.2"></circle>
          <circle class="f-face" cx="126.5" cy="97.5" r="2.2"></circle>
        </g>
      </g>
      <g class="m-eyes-closed">
        <path class="ln st-ink w4" d="M69 102 Q76 108 83 102"></path>
        <path class="ln st-ink w4" d="M117 102 Q124 108 131 102"></path>
      </g>
      <g class="m-eyes-happy">
        <path class="ln st-ink w4" d="M69 104 Q76 94 83 104"></path>
        <path class="ln st-ink w4" d="M117 104 Q124 94 131 104"></path>
      </g>
      <circle class="ln st-ink w5" cx="76" cy="100" r="20"></circle>
      <circle class="ln st-ink w5" cx="124" cy="100" r="20"></circle>
      <path class="m-glint ln st-face w4" d="M64 94 L70 86"></path>
      <path class="ln st-ink w5" d="M96 98 Q100 93 104 98"></path>
      <path class="ln st-ink w5" d="M56 97 L45 93"></path>
      <path class="ln st-ink w5" d="M144 97 L155 93"></path>
      <path class="m-lips ln st-ink w5" d="M89.9 135.0 Q100 142.0 110.1 135.0"></path>
      <g class="m-mouth">
        <path class="f-ink" d="M86 129.0 Q100 125.0 114 129.0 Q114 147.0 100 147.0 Q86 147.0 86 129.0 Z"></path>
        <ellipse class="f-body" cx="100" cy="142.5" rx="6.3" ry="3.0"></ellipse>
      </g>
      <path class="f-ink2" d="M100 163 L85 155 Q81 163 85 171 Z"></path>
      <path class="f-ink2" d="M100 163 L115 155 Q119 163 115 171 Z"></path>
      <circle class="f-ink" cx="100" cy="163" r="4.5"></circle>
    </g>
    <g class="m-cup" aria-hidden="true">
      <path class="m-steam ln st-ink2 w3" d="M146 142 q-4 -5 0 -10 q4 -5 0 -10"></path>
      <path class="m-steam m-steam-2 ln st-ink2 w3" d="M156 142 q-4 -5 0 -10 q4 -5 0 -10"></path>
      <path class="ln st-ink w4" d="M165 155 Q176 155 176 162 Q176 170 165 170"></path>
      <path class="f-face st-ink w4" d="M136 148 H166 V164 Q166 178 152 178 H150 Q136 178 136 164 Z"></path>
      <rect class="f-body" x="138.5" y="154" width="25" height="6" rx="2"></rect>
    </g>
  </g>
  <g class="m-listen" aria-hidden="true">
    <path class="ln st-ink2 w4" d="M181 82 Q189 95 181 108"></path>
    <path class="m-listen-2 ln st-ink2 w4" d="M190 74 Q201 95 190 116"></path>
  </g>
  <g class="m-think" aria-hidden="true">
    <circle class="f-face st-ink2 w3" cx="138" cy="46" r="3.5"></circle>
    <circle class="f-face st-ink2 w3" cx="145" cy="38" r="5"></circle>
    <rect class="f-face st-ink2 w3" x="148" y="8" width="50" height="26" rx="13"></rect>
    <circle class="m-dot m-dot-1 f-ink2" cx="161" cy="21" r="3.6"></circle>
    <circle class="m-dot m-dot-2 f-ink2" cx="173" cy="21" r="3.6"></circle>
    <circle class="m-dot m-dot-3 f-ink2" cx="185" cy="21" r="3.6"></circle>
  </g>
  <g class="m-cheer" aria-hidden="true">
    <path class="m-star m-star-1 f-body" d="M18 43 Q19.4 50.6 27 52 Q19.4 53.4 18 61 Q16.6 53.4 9 52 Q16.6 50.6 18 43 Z"></path>
    <path class="m-star m-star-2 f-ink2" d="M184 43 Q185.1 48.9 191 50 Q185.1 51.1 184 57 Q182.9 51.1 177 50 Q182.9 48.9 184 43 Z"></path>
    <path class="m-star m-star-3 f-ink2" d="M12 98 Q13.0 103.0 18 104 Q13.0 105.0 12 110 Q11.0 105.0 6 104 Q11.0 103.0 12 98 Z"></path>
    <path class="m-star m-star-4 f-body" d="M190 152 Q191.3 158.7 198 160 Q191.3 161.3 190 168 Q188.7 161.3 182 160 Q188.7 158.7 190 152 Z"></path>
  </g>
</svg>` },
  slownik: { name: 'Słownik', svg: `<svg class="mascot mascot--slownik" viewBox="0 0 200 200" role="img" aria-label="Słownik, maskotka Gym Coach">
  <ellipse class="m-shadow" cx="100" cy="187" rx="50" ry="6"></ellipse>
  <g class="m-tilt">
    <g class="m-body">
      <path class="ln st-ink2 w6" d="M82 168 V180 M120 168 V180"></path>
      <ellipse class="f-ink" cx="78" cy="182" rx="11" ry="5.5"></ellipse>
      <ellipse class="f-ink" cx="124" cy="182" rx="11" ry="5.5"></ellipse>
      <path class="f-ink2" d="M120 14 H133 V40 L126.5 34 L120 40 Z"></path>
      <path class="ln st-ink2 w6" d="M48 116 Q34 126 34 143"></path>
      <circle class="f-ink2" cx="34" cy="146" r="6.5"></circle>
      <g class="m-arm-r">
        <path class="ln st-ink2 w6" d="M154 116 Q168 126 168 143"></path>
        <circle class="f-ink2" cx="168" cy="146" r="6.5"></circle>
      </g>
      <rect class="f-face st-clay w3" x="136" y="36" width="25" height="134" rx="8"></rect>
      <path class="ln st-clay w2" d="M152 46 V160 M157 50 V156"></path>
      <rect class="f-body" x="42" y="28" width="108" height="146" rx="16"></rect>
      <path class="ln st-clay w4" d="M60 36 V166"></path>
      <rect class="f-face" x="72" y="48" width="68" height="76" rx="22"></rect>
      <ellipse class="f-clay" cx="81" cy="104" rx="5" ry="3.5"></ellipse>
      <ellipse class="f-clay" cx="131" cy="104" rx="5" ry="3.5"></ellipse>
      <g class="m-brows">
        <path class="ln st-ink w5" d="M84 66 Q91 62 99 65"></path>
        <path class="ln st-ink w5" d="M113 65 Q120 62 128 66"></path>
      </g>
      <g class="m-eyes">
        <g class="m-look">
          <ellipse class="f-ink" cx="92" cy="83" rx="6.5" ry="8.5"></ellipse>
          <ellipse class="f-ink" cx="120" cy="83" rx="6.5" ry="8.5"></ellipse>
          <circle class="f-face" cx="94.4" cy="79.6" r="2.2"></circle>
          <circle class="f-face" cx="122.4" cy="79.6" r="2.2"></circle>
        </g>
      </g>
      <g class="m-eyes-closed">
        <path class="ln st-ink w5" d="M85.5 84 Q92 90 98.5 84"></path>
        <path class="ln st-ink w5" d="M113.5 84 Q120 90 126.5 84"></path>
      </g>
      <g class="m-eyes-happy">
        <path class="ln st-ink w5" d="M85.5 86 Q92 76 98.5 86"></path>
        <path class="ln st-ink w5" d="M113.5 86 Q120 76 126.5 86"></path>
      </g>
      <path class="m-lips ln st-ink w5" d="M98.1 105.0 Q106 112.0 113.9 105.0"></path>
      <g class="m-mouth">
        <path class="f-ink" d="M95 100.0 Q106 96.0 117 100.0 Q117 116.0 106 116.0 Q95 116.0 95 100.0 Z"></path>
        <ellipse class="f-body" cx="106" cy="111.5" rx="5.0" ry="2.7"></ellipse>
      </g>
      <rect class="f-clay" x="80" y="138" width="52" height="7" rx="3.5"></rect>
      <rect class="f-clay" x="88" y="151" width="36" height="7" rx="3.5"></rect>
    </g>
    <g class="m-cup" aria-hidden="true">
      <path class="m-steam ln st-ink2 w3" d="M146 142 q-4 -5 0 -10 q4 -5 0 -10"></path>
      <path class="m-steam m-steam-2 ln st-ink2 w3" d="M156 142 q-4 -5 0 -10 q4 -5 0 -10"></path>
      <path class="ln st-ink w4" d="M165 155 Q176 155 176 162 Q176 170 165 170"></path>
      <path class="f-face st-ink w4" d="M136 148 H166 V164 Q166 178 152 178 H150 Q136 178 136 164 Z"></path>
      <rect class="f-body" x="138.5" y="154" width="25" height="6" rx="2"></rect>
    </g>
  </g>
  <g class="m-listen" aria-hidden="true">
    <path class="ln st-ink2 w4" d="M178 82 Q186 95 178 108"></path>
    <path class="m-listen-2 ln st-ink2 w4" d="M187 74 Q198 95 187 116"></path>
  </g>
  <g class="m-think" aria-hidden="true">
    <circle class="f-face st-ink2 w3" cx="140" cy="40" r="3.5"></circle>
    <circle class="f-face st-ink2 w3" cx="147" cy="32" r="5"></circle>
    <rect class="f-face st-ink2 w3" x="150" y="2" width="50" height="26" rx="13"></rect>
    <circle class="m-dot m-dot-1 f-ink2" cx="163" cy="15" r="3.6"></circle>
    <circle class="m-dot m-dot-2 f-ink2" cx="175" cy="15" r="3.6"></circle>
    <circle class="m-dot m-dot-3 f-ink2" cx="187" cy="15" r="3.6"></circle>
  </g>
  <g class="m-cheer" aria-hidden="true">
    <path class="m-star m-star-1 f-body" d="M18 31 Q19.4 38.6 27 40 Q19.4 41.4 18 49 Q16.6 41.4 9 40 Q16.6 38.6 18 31 Z"></path>
    <path class="m-star m-star-2 f-ink2" d="M184 77 Q185.1 82.9 191 84 Q185.1 85.1 184 91 Q182.9 85.1 177 84 Q182.9 82.9 184 77 Z"></path>
    <path class="m-star m-star-3 f-ink2" d="M16 94 Q17.0 99.0 22 100 Q17.0 101.0 16 106 Q15.0 101.0 10 100 Q15.0 99.0 16 94 Z"></path>
    <path class="m-star m-star-4 f-body" d="M190 152 Q191.3 158.7 198 160 Q191.3 161.3 190 168 Q188.7 161.3 182 160 Q188.7 158.7 190 152 Z"></path>
  </g>
</svg>` },
  mikro: { name: 'Mikro', svg: `<svg class="mascot mascot--mikro" viewBox="0 0 200 200" role="img" aria-label="Mikro, maskotka Gym Coach">
  <ellipse class="m-shadow" cx="100" cy="187" rx="44" ry="6"></ellipse>
  <g class="m-tilt">
    <g class="m-body">
      <rect class="f-ink" x="64" y="170" width="72" height="13" rx="6.5"></rect>
      <rect class="f-ink2" x="93" y="148" width="14" height="24" rx="4"></rect>
      <path class="ln st-ink2 w7" d="M42 96 V114 Q42 154 100 156 Q158 154 158 114 V96"></path>
      <rect class="f-body" x="50" y="26" width="100" height="126" rx="50"></rect>
      <path class="f-ink2" d="M50 84 V76 A50 50 0 0 1 150 76 V84 Z"></path>
      <path class="ln st-grille w3" d="M74 44 H126 M60 58 H140 M54 72 H146"></path>
      <rect class="f-clay" x="46" y="82" width="108" height="16" rx="8"></rect>
      <circle class="m-led" cx="100" cy="90" r="4.5"></circle>
      <circle class="f-ink2" cx="42" cy="96" r="8"></circle>
      <circle class="f-ink2" cx="158" cy="96" r="8"></circle>
      <ellipse class="f-clay" cx="67" cy="133" rx="6" ry="4"></ellipse>
      <ellipse class="f-clay" cx="133" cy="133" rx="6" ry="4"></ellipse>
      <g class="m-brows">
        <path class="ln st-ink w5" d="M74 108 Q82 104 90 107"></path>
        <path class="ln st-ink w5" d="M110 107 Q118 104 126 108"></path>
      </g>
      <g class="m-eyes">
        <g class="m-look">
          <ellipse class="f-ink" cx="84" cy="120" rx="6.5" ry="8"></ellipse>
          <ellipse class="f-ink" cx="116" cy="120" rx="6.5" ry="8"></ellipse>
          <circle class="f-face" cx="86.4" cy="116.8" r="2.2"></circle>
          <circle class="f-face" cx="118.4" cy="116.8" r="2.2"></circle>
        </g>
      </g>
      <g class="m-eyes-closed">
        <path class="ln st-ink w5" d="M77.5 121 Q84 127 90.5 121"></path>
        <path class="ln st-ink w5" d="M109.5 121 Q116 127 122.5 121"></path>
      </g>
      <g class="m-eyes-happy">
        <path class="ln st-ink w5" d="M77.5 123 Q84 113 90.5 123"></path>
        <path class="ln st-ink w5" d="M109.5 123 Q116 113 122.5 123"></path>
      </g>
      <path class="m-lips ln st-ink w5" d="M92.1 137.0 Q100 144.0 107.9 137.0"></path>
      <g class="m-mouth">
        <path class="f-ink" d="M89 133.0 Q100 129.0 111 133.0 Q111 147.0 100 147.0 Q89 147.0 89 133.0 Z"></path>
        <ellipse class="f-body" cx="100" cy="142.5" rx="5.0" ry="2.4"></ellipse>
      </g>
    </g>
    <g class="m-cup" aria-hidden="true">
      <path class="m-steam ln st-ink2 w3" d="M146 142 q-4 -5 0 -10 q4 -5 0 -10"></path>
      <path class="m-steam m-steam-2 ln st-ink2 w3" d="M156 142 q-4 -5 0 -10 q4 -5 0 -10"></path>
      <path class="ln st-ink w4" d="M165 155 Q176 155 176 162 Q176 170 165 170"></path>
      <path class="f-face st-ink w4" d="M136 148 H166 V164 Q166 178 152 178 H150 Q136 178 136 164 Z"></path>
      <rect class="f-body" x="138.5" y="154" width="25" height="6" rx="2"></rect>
    </g>
  </g>
  <g class="m-listen" aria-hidden="true">
    <path class="ln st-ink2 w4" d="M170 82 Q178 95 170 108"></path>
    <path class="m-listen-2 ln st-ink2 w4" d="M179 74 Q190 95 179 116"></path>
  </g>
  <g class="m-think" aria-hidden="true">
    <circle class="f-face st-ink2 w3" cx="132" cy="38" r="3.5"></circle>
    <circle class="f-face st-ink2 w3" cx="139" cy="30" r="5"></circle>
    <rect class="f-face st-ink2 w3" x="142" y="0" width="50" height="26" rx="13"></rect>
    <circle class="m-dot m-dot-1 f-ink2" cx="155" cy="13" r="3.6"></circle>
    <circle class="m-dot m-dot-2 f-ink2" cx="167" cy="13" r="3.6"></circle>
    <circle class="m-dot m-dot-3 f-ink2" cx="179" cy="13" r="3.6"></circle>
  </g>
  <g class="m-cheer" aria-hidden="true">
    <path class="m-star m-star-1 f-body" d="M20 35 Q21.4 42.6 29 44 Q21.4 45.4 20 53 Q18.6 45.4 11 44 Q18.6 42.6 20 35 Z"></path>
    <path class="m-star m-star-2 f-ink2" d="M182 68 Q183.0 73.0 188 74 Q183.0 75.0 182 80 Q181.0 75.0 176 74 Q181.0 73.0 182 68 Z"></path>
    <path class="m-star m-star-3 f-ink2" d="M18 124 Q19.0 129.0 24 130 Q19.0 131.0 18 136 Q17.0 131.0 12 130 Q17.0 129.0 18 124 Z"></path>
    <path class="m-star m-star-4 f-body" d="M186 142 Q187.3 148.7 194 150 Q187.3 151.3 186 158 Q184.7 151.3 178 150 Q184.7 148.7 186 142 Z"></path>
  </g>
</svg>` },
  glob: { name: 'Glob', svg: `<svg class="mascot mascot--glob" viewBox="0 0 200 200" role="img" aria-label="Glob, maskotka Gym Coach">
  <ellipse class="m-shadow" cx="100" cy="187" rx="38" ry="6"></ellipse>
  <g class="m-tilt">
    <g class="m-body">
      <rect class="f-ink2" x="95" y="168" width="10" height="12" rx="3"></rect>
      <ellipse class="f-ink" cx="100" cy="181" rx="28" ry="6"></ellipse>
      <circle class="f-body" cx="100" cy="100" r="62"></circle>
      <g class="m-spin">
        <path class="f-clay" d="M140 60 Q150 58 152 68 Q160 72 158 84 Q152 88 154 98 Q150 110 142 106 Q138 96 132 92 Q134 80 128 74 Q132 62 140 60 Z"></path>
        <path class="f-clay" d="M50 120 Q60 116 66 124 Q76 126 78 136 Q84 144 76 150 Q66 148 62 140 Q52 138 50 128 Z"></path>
        <path class="f-clay" d="M118 146 Q128 142 134 148 Q130 156 120 154 Z"></path>
        <path class="f-clay" d="M66 56 Q76 50 86 54 Q86 60 78 62 Q70 64 66 56 Z"></path>
      </g>
      <path class="ln st-clay w3" d="M48 68 Q100 84 152 68 M48 136 Q100 152 152 136"></path>
      <path class="ln st-ink2 w7" d="M64 38 A72 72 0 1 1 64 162"></path>
      <circle class="f-ink2" cx="64" cy="38" r="5.5"></circle>
      <circle class="f-ink2" cx="64" cy="162" r="5.5"></circle>
      <ellipse class="f-soft" cx="70" cy="118" rx="7" ry="4.5"></ellipse>
      <ellipse class="f-soft" cx="130" cy="118" rx="7" ry="4.5"></ellipse>
      <g class="m-brows">
        <path class="ln st-ink w5" d="M75 80 Q83 75 91 78"></path>
        <path class="ln st-ink w5" d="M109 78 Q117 75 125 80"></path>
      </g>
      <g class="m-eyes">
        <g class="m-look">
          <ellipse class="f-ink" cx="84" cy="98" rx="7" ry="9"></ellipse>
          <ellipse class="f-ink" cx="116" cy="98" rx="7" ry="9"></ellipse>
          <circle class="f-face" cx="86.5" cy="94.5" r="2.3"></circle>
          <circle class="f-face" cx="118.5" cy="94.5" r="2.3"></circle>
        </g>
      </g>
      <g class="m-eyes-closed">
        <path class="ln st-ink w5" d="M77 99 Q84 105 91 99"></path>
        <path class="ln st-ink w5" d="M109 99 Q116 105 123 99"></path>
      </g>
      <g class="m-eyes-happy">
        <path class="ln st-ink w5" d="M77 101 Q84 91 91 101"></path>
        <path class="ln st-ink w5" d="M109 101 Q116 91 123 101"></path>
      </g>
      <path class="m-lips ln st-ink w5" d="M91.4 121.0 Q100 128.0 108.6 121.0"></path>
      <g class="m-mouth">
        <path class="f-ink" d="M88 116.0 Q100 112.0 112 116.0 Q112 132.0 100 132.0 Q88 132.0 88 116.0 Z"></path>
        <ellipse class="f-body" cx="100" cy="127.5" rx="5.4" ry="2.7"></ellipse>
      </g>
    </g>
    <g class="m-cup" aria-hidden="true">
      <path class="m-steam ln st-ink2 w3" d="M146 142 q-4 -5 0 -10 q4 -5 0 -10"></path>
      <path class="m-steam m-steam-2 ln st-ink2 w3" d="M156 142 q-4 -5 0 -10 q4 -5 0 -10"></path>
      <path class="ln st-ink w4" d="M165 155 Q176 155 176 162 Q176 170 165 170"></path>
      <path class="f-face st-ink w4" d="M136 148 H166 V164 Q166 178 152 178 H150 Q136 178 136 164 Z"></path>
      <rect class="f-body" x="138.5" y="154" width="25" height="6" rx="2"></rect>
    </g>
  </g>
  <g class="m-listen" aria-hidden="true">
    <path class="ln st-ink2 w4" d="M182 82 Q190 95 182 108"></path>
    <path class="m-listen-2 ln st-ink2 w4" d="M191 74 Q202 95 191 116"></path>
  </g>
  <g class="m-think" aria-hidden="true">
    <circle class="f-face st-ink2 w3" cx="132" cy="42" r="3.5"></circle>
    <circle class="f-face st-ink2 w3" cx="139" cy="34" r="5"></circle>
    <rect class="f-face st-ink2 w3" x="142" y="4" width="50" height="26" rx="13"></rect>
    <circle class="m-dot m-dot-1 f-ink2" cx="155" cy="17" r="3.6"></circle>
    <circle class="m-dot m-dot-2 f-ink2" cx="167" cy="17" r="3.6"></circle>
    <circle class="m-dot m-dot-3 f-ink2" cx="179" cy="17" r="3.6"></circle>
  </g>
  <g class="m-cheer" aria-hidden="true">
    <path class="m-star m-star-1 f-ink2" d="M18 31 Q19.4 38.6 27 40 Q19.4 41.4 18 49 Q16.6 41.4 9 40 Q16.6 38.6 18 31 Z"></path>
    <path class="m-star m-star-2 f-body" d="M190 33 Q191.1 38.9 197 40 Q191.1 41.1 190 47 Q188.9 41.1 183 40 Q188.9 38.9 190 33 Z"></path>
    <path class="m-star m-star-3 f-body" d="M14 142 Q15.3 148.7 22 150 Q15.3 151.3 14 158 Q12.7 151.3 6 150 Q12.7 148.7 14 142 Z"></path>
    <path class="m-star m-star-4 f-ink2" d="M186 144 Q187.0 149.0 192 150 Q187.0 151.0 186 156 Q185.0 151.0 180 150 Q185.0 149.0 186 144 Z"></path>
  </g>
</svg>` }
};

export const DEFAULT_MASCOT = 'trener';
const STORAGE_KEY = 'gc.mascot';

export function getMascotId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id && Object.hasOwn(MASCOTS, id)) return id;
  } catch {}
  return DEFAULT_MASCOT;
}

export function setMascotId(id) {
  if (!Object.hasOwn(MASCOTS, id)) return;
  try { localStorage.setItem(STORAGE_KEY, id); } catch {}
}

// Puts the mascot into the host, with its entrance animation. Its state comes from
// the nearest ancestor with an is-* class (the lesson stage, set by React).
export function mountMascot(host, id = getMascotId(), { enter = true } = {}) {
  const key = Object.hasOwn(MASCOTS, id) ? id : DEFAULT_MASCOT;
  if (host.dataset.mascot === key && host.firstElementChild) return key;
  host.innerHTML = MASCOTS[key].svg;
  host.dataset.mascot = key;
  if (enter) {
    host.classList.remove('m-enter');
    void host.offsetWidth; // restarts the animation
    host.classList.add('m-enter');
    setTimeout(() => host.classList.remove('m-enter'), 800);
  }
  return key;
}

// How far the mouth is open, 0-1, on the stage; called every frame from the audio level.
export function setMascotLevel(stage, level) {
  const v = Math.max(0, Math.min(1, Number(level) || 0));
  stage.style.setProperty('--level', v.toFixed(3));
}
