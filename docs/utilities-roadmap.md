# 미지원 유틸리티 지원 설계 (utilities roadmap)

현재 `no-roblox-equivalent`로 경고만 내보내는 Tailwind 패밀리들을 지원 가능성 기준으로
재분류하고, 지원 가능한 것들의 lowering 설계를 정의한다.

분류 축은 구현 난이도가 아니라 **어떤 종류의 매핑이 필요한가**다.

| 등급 | 의미 |
| --- | --- |
| A. 순수 프로퍼티 매핑 | 기존 아키텍처(스태틱 lowering + 헬퍼)로 즉시 표현 가능 |
| B. 런타임 호스트 확장 | `VelaRuntimeHost`에 새 능력(트윈, Text 파이프라인)이 필요 |
| C. 구조 변형 | JSX 트리 자체를 바꿔야 함 (요소 래핑, 자식 주입) |
| D. 표현 불가 | Roblox UI에 대응 개념이 없음 — `no-roblox-equivalent` 유지 |

## Phase 1 — 순수 매핑 (등급 A) — **구현 완료**

기존 유틸리티 추가 체크리스트만 따르면 되는 것들. `mx-auto`/`my-auto`도 이
페이즈에 편입해 함께 구현했다.

### `object-*` → ImageLabel/ImageButton `ScaleType`

| 토큰 | 값 |
| --- | --- |
| `object-cover` | `Enum.ScaleType.Crop` |
| `object-contain` | `Enum.ScaleType.Fit` |
| `object-fill` | `Enum.ScaleType.Stretch` |

- 호스트 제한: `imagelabel`, `imagebutton` (`is_utility_allowed_on_host`).
- `object-none`, `object-scale-down`, `object-{position}`은 대응 없음 →
  `unsupported-object-value` 진단.
- Roblox 고유 값 확장: `object-tile` → `Enum.ScaleType.Tile` (Tailwind에 없지만
  Roblox에서 자주 쓰이므로 vela 확장으로 제공).

### `pointer-events-*` → `Interactable`

| 토큰 | 값 |
| --- | --- |
| `pointer-events-none` | `Interactable = false` |
| `pointer-events-auto` | `Interactable = true` |

- 모든 호스트 허용. family는 `pointer`(`pointer-events-` prefix 파싱).

### `space-x-*` / `space-y-*` → UIListLayout `Padding`

Tailwind의 `space-*`는 "자식들 사이 간격" = 정확히 `UIListLayout.Padding`.

- `space-x-N` → `uilistlayout.Padding = <spacing N>` + `FillDirection = Horizontal`
- `space-y-N` → `uilistlayout.Padding = <spacing N>` + `FillDirection = Vertical`
- `gap-*`과 같은 spacing 스케일/진단 재사용. `gap`과 동시 사용 시 나중 토큰 승리(기존 규칙).
- `space-x-reverse`는 대응 없음 → 값 진단.

### `whitespace-{normal,nowrap}` → `TextWrapped`

- `whitespace-normal` → `TextWrapped = true`, `whitespace-nowrap` → `false`
  (`text-wrap`/`text-nowrap`의 별칭). 텍스트 호스트 전용.
- `whitespace-pre*` 계열은 대응 없음 → 값 진단.

### `overscroll-*` → ScrollingFrame `ElasticBehavior`

| 토큰 | 값 |
| --- | --- |
| `overscroll-auto` | `Enum.ElasticBehavior.Always` |
| `overscroll-contain` | `Enum.ElasticBehavior.WhenScrollable` |
| `overscroll-none` | `Enum.ElasticBehavior.Never` |

- 호스트 제한: `scrollingframe`.

### `ring-*` / `outline-*` → UIStroke 별칭

두 패밀리 모두 `border-*`와 같은 `uistroke` 헬퍼로 내린다. 한 인스턴스에
UIStroke는 하나만 신뢰성 있게 적용되므로 **별도 스트로크를 만들지 않고 같은
헬퍼에 병합**한다 (마지막 토큰 승리).

- `ring` → `Thickness = 3` (Tailwind 기본), `ring-N` → `Thickness = N` (0/1/2/4/8),
  `ring-{color}` → `Color`, 추가로 `ApplyStrokeMode = Border` 설정.
- `outline` → `Thickness = 2`, `outline-N`, `outline-{color}` 동일 규칙.
  `outline-none`/`outline-hidden` → `Thickness = 0`.
- `ring-offset-*`, `outline-offset-*`, `outline-dashed` 등은 대응 없음 → 값 진단.
- 진단 메시지에 "border와 같은 UIStroke를 공유한다"는 caveat를 hover 문서에 명시.

## Phase 2 — 트랜지션 (등급 B, 핵심 기능) — **구현 완료**

`transition` / `duration-*` / `ease-*` / `delay-*`를 TweenService로 지원한다.
현재 런타임 호스트는 환경(뷰포트/입력) 변화 시 props를 **즉시** 다시 적용하는
React 컴포넌트다. 여기에 "변경되는 prop을 트윈으로 적용" 모드를 추가한다.

### 문법 → 설정 lowering

트랜지션 토큰은 스타일 prop이 아니라 **호스트 설정**으로 내린다:

```tsx
// 입력
<frame className="bg-slate-700 md:bg-blue-600 transition duration-300 ease-out" />
// 출력 (개념)
React.createElement(VelaRuntimeHost, {
  __velaTag: "frame",
  __velaRules: [...],
  __velaTransition: { time: 0.3, style: "Quad", direction: "Out", delay: 0 },
  ...staticProps,
})
```

| 토큰 | TweenInfo 필드 |
| --- | --- |
| `transition` | 활성화 (기본 time 0.15) |
| `transition-none` | 비활성화 |
| `duration-N` (75/100/150/200/300/500/700/1000, 임의 정수 ms) | `time = N/1000` |
| `delay-N` | `delayTime = N/1000` |
| `ease-linear` | `Enum.EasingStyle.Linear` |
| `ease-in` | `Quad` + `Enum.EasingDirection.In` |
| `ease-out` | `Quad` + `Out` |
| `ease-in-out` | `Quad` + `InOut` |

- `transition-colors|opacity|transform`는 트윈 대상 prop을 좁힌다 (`colors` →
  `*Color3`, `opacity` → `*Transparency`, `transform` → Position/Size/Rotation/
  AnchorPoint). 그룹 밖 prop은 즉시 적용. `transition-shadow`는 그림자가 헬퍼
  인스턴스라 즉시 적용되므로 걸러낼 대상이 없어 진단으로 돌린다.
- `hover:` variant는 호스트가 MouseEnter/MouseLeave로 상태를 추적해 지원한다
  (소비자 Event 핸들러와 합성). `bg-[#hex]` arbitrary 색과 `색/불투명도`
  수식어(`bg-blue-600/50` → transparency prop)도 지원 — 수식어는 transparency
  prop이 있는 패밀리(bg/text/image/shadow/ring/outline)에서만 동작한다.
- 트랜지션 토큰만 있고 runtime rule이 없는 요소는 지금은 정적 lowering되므로,
  `transition`이 있으면 **호스트로 승격**해야 한다 (`needsRuntimeHost` 조건에 추가).

### 런타임 적용 방식

1. 호스트가 `React.useRef`로 실제 인스턴스를 잡는다 (`ref` prop 전달).
2. 환경 변화로 계산된 props가 바뀌면, 트윈 가능 타입(number, `UDim2`, `UDim`,
   `Color3`, `Vector2`)은 선언적으로 넘기지 않고 **직전 값 유지 + TweenService로
   인스턴스에 트윈**한다. `Enum`/bool/string은 즉시 적용.
3. 헬퍼 인스턴스(uicorner 등)의 트윈은 helper ref로 동일 처리. 1차 범위는
   최상위 인스턴스 프로퍼티만, 헬퍼는 즉시 적용으로 시작.
4. 사용자가 같은 prop을 직접 제어하는 경우(명시 prop) 트윈 대상에서 제외 —
   기존의 "명시 prop 우선" 규칙 유지.

주의: React 재조정과 임퍼러티브 트윈이 충돌하지 않도록, 트윈 대상 prop은
호스트가 마지막으로 트윈한 목표값을 기억하고 재렌더 시 그 값으로 넘긴다.

### `animate-*` (Phase 2.5) — **구현 완료**

슬로팅 라이브러리(lattice-ui 등) 호환을 위해 런타임 호스트는 `forwardRef`로
렌더링하며, 자체 인스턴스 ref와 전달받은 ref를 합성한다. 컴포넌트 요소에는
트윈이 닿을 인스턴스가 없으므로 `transition`/`animate-*`는 호스트 태그에서만
동작하고, 컴포넌트에 쓰면 `motion-on-component` 경고 후 무시된다 — `asChild`
자식 호스트 요소에 붙이는 것이 올바른 사용법이다.

프리셋 루프 트윈. 동일한 ref 기반 메커니즘 재사용.

| 토큰 | 구현 |
| --- | --- |
| `animate-spin` | Rotation 0→360 선형 무한 루프 (1s) |
| `animate-pulse` | BackgroundTransparency 0→0.5→0 (2s, ease-in-out) |
| `animate-bounce` | Position offset Y 0→-25%→0 루프 |
| `animate-none` | 해제 |

`animate-ping`은 복제 요소가 필요해 구조 변형 없이는 불가 → 값 진단 유지.

## Phase 3 — Text 파이프라인 (등급 B) — **구현 완료**

Text prop을 호스트에서 가공해야 하는 것들. 런타임 호스트에 "Text 변환 체인"을
추가한다: `Text = pipeline(원본 Text)`. 정적 문자열 리터럴이면 컴파일 타임에
변환해 호스트 승격을 피한다.

- `uppercase` / `lowercase` → `string.upper` / `string.lower`
  (ASCII 한정임을 hover 문서에 명시; 한글 등은 무변화라 안전).
- `capitalize` → 단어 첫 글자 upper.
- `normal-case` → 변환 해제.
- `underline` / `line-through` → `RichText = true` 설정 후 Text를 `<u>…</u>` /
  `<s>…</s>`로 감싼다. **원본 Text에 RichText 특수문자(`<`, `&`)가 있으면
  이스케이프**해야 함. 사용자가 이미 `RichText`를 쓰는 요소에는 이중 이스케이프
  위험 → 사용자가 `RichText` prop을 명시한 경우 진단(`underline-on-richtext`)을
  내고 변환을 건너뛴다.
- `overline`은 RichText 태그가 없음 → 미지원 유지.

## Phase 4 — 구조 변형 (등급 C) — **구현 완료** (4.1 margin, 4.2 divide), 리뷰: `phase4-structural-review.md`

### `m-*` (마진) — 래퍼 프레임 방식

Roblox에는 마진이 없으므로 표준 에뮬레이션은 래핑이다:

```tsx
<frame className="m-4 bg-slate-700" />
// ↓
<frame BackgroundTransparency={1} AutomaticSize={XY}>
  <uipadding PaddingTop/Right/Bottom/Left={16} />
  <frame BackgroundColor3={...} Size={UDim2.fromScale(1, 1)} />
</frame>
```

풀어야 할 문제들 (이 때문에 Phase 4로 분리):
- `Size`/`Position`/`LayoutOrder`/`AnchorPoint`는 래퍼로 이관하고 내부 요소는
  `fromScale(1,1)`로 채우는 규칙 필요.
- `ref`/이벤트 prop은 내부 요소에 남아야 함.
- key/재조정: 래퍼에 안정적인 key 부여.
- 리스트 레이아웃 안에서의 의미(마진이 gap과 합산됨)를 문서화.

`space-*`가 Phase 1에서 해결되면 마진의 실수요 대부분(리스트 간격)이 사라지므로,
실사용 요구가 확인된 뒤 진행한다. `mx-auto`(중앙 정렬)만은 래핑 없이
`AnchorPoint.X=0.5 + Position.X=0.5`로 표현 가능하니 Phase 1에 선행 편입 가능.

### `divide-x/y-*` — 자식 사이 구분선

자식마다 UIStroke/프레임 주입이 필요 → 부모가 자식 목록을 재구성해야 한다.
JSX 자식이 동적이면 컴파일 타임에 불가능하고 런타임 호스트가 자식을 순회해야
한다. 런타임 호스트가 콘텐츠 자식 사이에만 구분선 프레임을 삽입하는 방식으로
**구현 완료** — 상세는 `phase4-structural-review.md` 참고.

## Phase 5 — Roblox 고유 프로퍼티 (등급 A) — **구현 완료**

Tailwind 파리티가 아니라 Roblox 인스턴스에만 있는 프로퍼티를 채우는 페이즈.
호스트 제한은 `is_utility_allowed_on_host`가 담당하며, 전부 정적 lowering이다.

### ScrollingFrame 패밀리

`overscroll-*` 하나뿐이던 scrollingframe 지원을 실제로 쓰는 프로퍼티까지 넓혔다.

| 토큰 | 값 |
| --- | --- |
| `scroll-x` / `scroll-y` / `scroll-xy` | `ScrollingDirection` |
| `scroll-none` | `ScrollingEnabled = false` |
| `scrollbar-w-{spacing}` | `ScrollBarThickness` (spacing 스케일 → offset) |
| `scrollbar-none` | `ScrollBarThickness = 0` |
| `scrollbar-{color}` (`/N` 수식어 포함) | `ScrollBarImageColor3` / `ScrollBarImageTransparency` |
| `canvas-auto` / `canvas-auto-x` / `canvas-auto-y` / `canvas-none` | `AutomaticCanvasSize` |

- `scroll` 패밀리를 `is_known_tailwind_family`에서 꺼냈으므로 Tailwind의
  `scroll-smooth` / `scroll-m-*`는 `no-roblox-equivalent`가 아니라
  `unsupported-scroll-value`로 보고된다 — 대체 토큰을 메시지에 담을 수 있다.
- `scrollbar-*` / `canvas-*`는 Tailwind에 없는 vela 확장 (`object-tile` 선례).

### `font-{family}` — 테마 축 추가

`FontFace`의 family가 Source Sans Pro로 고정돼 있어 weight/style만 고를 수
있었다. `theme.fontFamily`를 새 테마 축으로 추가하고 `font-*`가 두 스케일을
겸하게 했다 — Tailwind와 같은 규칙으로, 고정된 weight 이름이 먼저 이기고
나머지 payload는 font family 키로 조회한다(`parse_utility`는 config를 받지
않으므로 weight 테이블만으로 분기 가능).

- 기본값: `sans`(SourceSansPro) / `serif`(Merriweather) / `mono`(RobotoMono).
  값은 Roblox 폰트 패밀리 에셋 문자열이라 업로드한 `rbxassetid://` 폰트도 된다.
- family/weight/style은 `PendingAxes`에서 합쳐져 하나의 `FontFace`로 나간다.
- 배선: `config/defaults.json`, `packages/config/src/index.ts`,
  `packages/vela-rbxts/schema.json`, `config/model.rs`(serde `fontFamily`),
  `config/merge.rs`.

### `opacity-*`의 호스트 인지

`opacity-*`는 `BackgroundTransparency`로만 내려갔는데, CanvasGroup은 서브트리를
합성하므로 CSS `opacity`에 대응하는 프로퍼티는 `GroupTransparency`뿐이다.
`canvasgroup` 호스트에서만 그쪽으로 내린다. 이를 위해 lowering이 호스트 태그를
받도록 `resolve_class_tokens(tokens, config, element_tag, diagnostics)`로 넓혔고,
컴포넌트 요소는 태그를 알 수 없으므로 `None` — 기존 동작을 유지한다.

## 영구 미지원 (등급 D — `no-roblox-equivalent` 유지)

| 패밀리 | 근거 |
| --- | --- |
| `tracking-*`, `indent-*`, `break-*`, `hyphens-*`, `list-*` | Roblox 텍스트 엔진에 자간/들여쓰기/줄바꿈 제어 없음 |
| `decoration-*`, `overline` | RichText에 대응 태그/속성 없음 |
| `blur-*`, `backdrop-*`, `grayscale`, `invert`, `sepia`, `contrast-*` | UI 요소 단위 필터 없음 (BlurEffect는 카메라 전역) |
| `skew-*`, `perspective-*`, `transform-3d` | 2D UI에 기울임/원근 없음 |
| `float`, `clear`, `columns-*`, `col-span-*`, `row-span-*` | 대응 레이아웃 개념 없음 (UIGridLayout은 span 미지원) |
| `static/fixed/absolute/relative/sticky`, `block/inline/table/contents` | Roblox는 항상 부모 기준 절대 배치; positioning 모델 자체가 없음 |
| `cursor-*`, `caret-*`, `accent-*`, `appearance-*`, `select-*` | 요소 단위 커서/캐럿/네이티브 위젯 스타일 없음 |
| `snap-*`, `resize-*` | 스크롤 스냅/리사이즈 핸들 없음 |
| `isolate`, `box-*`, `container`, `sr-*`, `antialiased` | 해당 렌더링 개념 없음 |
| `brightness-*`, `fill-*`, `stroke-*` | 근사 매핑(ImageColor3)이 의미를 왜곡 — 오해 소지가 커서 제외 |

이 목록은 `is_known_tailwind_family`와 1:1로 유지하고, Phase 진행 시 여기서
꺼내는 것으로 관리한다.

## 구현 순서와 검증

1. **Phase 1** — 유틸리티 6패밀리 일괄 (기존 체크리스트 그대로: parse → analyze
   분류 제거 → lowering → 진단 → completions/hover/diagnostics → 유닛 테스트 →
   rbxts-harness/lsp-harness 프로브 추가). 구조 변경 없음.
2. **Phase 2** — 트랜지션. 트랜스폼 쪽: `needsRuntimeHost` 승격 + `__velaTransition`
   직렬화. 런타임 호스트: ref + TweenService. rbxts-harness에 md: variant와 함께
   트랜지션 프로브를 넣고, 에뮬레이션 없이도 emitted Luau의 TweenInfo 직렬화를
   검증. (실기기 동작은 Studio 수동 확인 항목으로 문서화)
3. **Phase 2.5 / 3** — animate 프리셋, Text 파이프라인. RichText 이스케이프는
   전용 유닛 테스트 필수.
4. **Phase 4** — 수요 확인 후 별도 설계 리뷰.
