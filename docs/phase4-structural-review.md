# Phase 4 설계 리뷰 — 구조 변형 유틸리티 (`m-*`, `divide-*`)

> **상태**: 4.1(margin, C안) 구현 완료. 트랜지션과 겹칠 때 래퍼로 라우팅된
> 레이아웃 prop은 v1에서는 트윈 없이 즉시 적용된다(래퍼 ref 트윈은 후속).
> 4.2(divide)도 구현 완료 — 리뷰의 설계·제약(LayoutOrder, gap 근사) 그대로.

Phase 4는 요소 하나의 프로퍼티를 바꾸는 것이 아니라 **렌더 트리 자체를 바꿔야
하는** 유틸리티들이다. 이 리뷰는 구현 전략 대안을 비교하고 권장안을 확정한다.

## 결론 요약

| 항목 | 권장 |
| --- | --- |
| `m-*` 구현 전략 | **C안: 런타임 호스트가 래퍼를 렌더** (컴파일 타임 트리 수술 아님) |
| margin 지원 범위 | `m/mx/my/mt/mr/mb/ml-*` + 음수, `mx-auto`는 기존 앵커 방식 유지 |
| `divide-x/y-*` | 같은 호스트 메커니즘으로 **구현 가능**하나 Phase 4.2로 분리, margin 안착 후 진행 |
| `space-x-reverse` 등 | 계속 미지원 (value 진단 유지) |

---

## 1. `m-*` 마진

### 의미론 확정

CSS margin box를 그대로 에뮬레이트한다: **투명 래퍼 frame = margin box**,
내부 요소 = border box. UIPadding이 마진 값을 표현한다.

```
wrapper(frame, 투명, Size = 선언 Size + 마진 합)
 ├─ uipadding (PaddingTop/Right/Bottom/Left = 마진)
 └─ inner(원래 요소, Size = fromScale(1, 1))
```

- 리스트(UIListLayout) 안: 래퍼가 리스트 아이템이 되므로 마진이 아이템 간
  간격에 합산된다 — CSS와 동일. `gap`과 중첩되면 합산됨을 문서화.
- 절대 배치: CSS에서 `left`는 margin edge 기준이므로 Position/AnchorPoint를
  래퍼로 옮기는 것이 정확히 CSS 의미와 일치한다.
- 음수 마진: UIPadding은 음수를 지원하지 않으므로 **음수 마진은 래퍼 없이
  Position offset 시프트로만** 처리 (translate와 같은 pending 경로 합류).
  래퍼+양수 마진과 혼합되면 축별로 계산해 병합.

### 크기 산식

| 내부 선언 | 래퍼 Size | 내부 Size |
| --- | --- | --- |
| `w-40` (offset 160) | `UDim2(0, 160+ml+mr, …)` | `fromScale(1,1)` |
| `w-1/2` (scale 0.5) | `UDim2(0.5, ml+mr, …)` | `fromScale(1,1)` |
| `w-auto` | 래퍼도 `AutomaticSize`, 내부는 auto 유지 | auto |

마진 값은 spacing 스케일이라 항상 offset → 산식은 순수 덧셈. scale 마진은
존재하지 않으므로 케이스 폭발이 없다.

### 전략 비교

**A안 — 컴파일 타임 트리 수술 (swc에서 JSX 래핑)**
- 장점: 정적 요소에 호스트 비용 없음.
- 단점: 사용자 prop 라우팅을 **컴파일 타임에** 해야 한다. `Size={expr}`,
  `LayoutOrder={props.i}` 같은 동적 attr을 래퍼로 옮기는 AST 수술, key 이관,
  `md:w-*` 런타임 rule이 래퍼 크기를 바꿔야 하는 경우(정적 래퍼는 못 따라감),
  transition/animate ref 대상 분기까지 — 구현 면적이 크고 엣지가 많다.

**B안 — 래퍼 없이 Position 시프트만**
- 마진의 주 용도(리스트 간격)를 포기하게 되므로 기각. `space-*`가 이미 그
  수요를 흡수했다는 반론이 있지만, 그렇다면 B안은 아예 만들 이유가 없다.

**C안 — 런타임 호스트가 래퍼를 렌더 (권장)**
- `m-*`가 있으면 `animate-*`처럼 **호스트로 승격**하고 `__velaMargin =
  {top,right,bottom,left}`를 넘긴다. 호스트가
  `createElement("frame", wrapperProps, createElement(tag, innerProps, …))`
  로 래핑한다.
- prop 라우팅이 **런타임 테이블 하나**로 끝난다: 동적이든 정적이든 사용자
  prop은 이미 props로 들어와 있으므로 AST 수술이 필요 없다.
- `md:` rule로 크기가 바뀌면 resolution이 재계산되고 래퍼 산식도 같이
  재계산된다 — A안의 최대 난점이 공짜로 풀린다.
- 비용: 정적 마진 요소도 호스트가 된다. 추가 인스턴스는 래퍼 frame 1개로
  A안과 동일하고, 컴포넌트 1층이 추가될 뿐이다. 수용 가능.

### C안 prop 라우팅 테이블 (핵심 산출물)

| 래퍼로 | 내부로 |
| --- | --- |
| `Size`(산식 적용), `Position`, `AnchorPoint`, `LayoutOrder`, `ZIndex`, `Visible`, `key` | 나머지 전부: 색/투명도, 텍스트 계열, `ref`, 이벤트(`Event`/`Change`/핸들러), 헬퍼 자식(uicorner 등) |
| `AutomaticSize`(내부가 auto일 때 양쪽) | `ClipsDescendants` |

- forwardRef/`instanceRef`(tween·animate 대상)는 **내부 요소**를 가리킨다.
  단, transition이 트윈하는 prop 중 래퍼로 라우팅된 것(Position/Size)은
  래퍼 인스턴스를 트윈해야 하므로 wrapper ref도 별도로 잡는다 —
  `splitTweenGoal`을 라우팅 테이블 기준으로 2분할.
- `mx-auto` + `m-*` 조합: 센터링(AnchorPoint/Position)은 래퍼에 적용.
- 컴포넌트 요소(`<Switch.Root className="m-4">`)도 동작한다: 래퍼는 호스트가
  만들고 내부가 컴포넌트 렌더이므로 인스턴스 접근이 필요 없다.
  motion과 달리 컴포넌트 제한이 없다.

### 진단

- `-m-*` 음수 + auto 크기 조합처럼 산식이 정의 안 되는 조합 → value 진단.
- 마진과 `basis`/`size-*` 등은 산식에 자연 포함되므로 추가 진단 불필요.

### 테스트 계획

- transform: `__velaMargin` 직렬화, 호스트 승격, 음수 마진 pending 경로.
- 런타임 로직은 rbxts-harness에서 emitted Luau의 래퍼 구조(투명 frame +
  uipadding + fromScale(1,1))를 패턴으로 검증. Studio 수동 항목: 리스트 안
  마진 간격.
- lattice 회귀: `<Switch.Root className="m-4">` 컴파일 확인 (아카이브된
  lattice-compat 하니스 재활용).

---

## 2. `divide-x/y-*` (Phase 4.2)

### 설계

호스트의 `normalizeChildren`이 이미 자식을 평탄화하므로, 호스트가 자식
사이마다 구분선 frame을 삽입하는 것은 같은 메커니즘의 연장이다:

```
[a, b, c] → [a, sep, b, sep, c]
sep = frame(Size: divide-x면 (0,N,1,0), divide-y면 (1,0,0,N), BackgroundColor3 = divide 색)
```

- `divide-x-N`(0/1/2/4/8, 기본 1) → 두께, `divide-{color}` → 색 (테마 해석은
  기존 색 resolver 재사용).
- 조건부 자식(`cond && <frame/>`)은 normalizeChildren이 이미 걸러주므로
  구분선 수가 자동으로 맞는다.

### 제약 (문서화 필수)

- **자식이 명시적 `LayoutOrder`를 쓰면 구분선 순서가 깨진다** — UIListLayout
  정렬에서 구분선(기본 0)이 엉뚱한 위치로 간다. 이 경우를 감지할 수 없으므로
  hover/문서에 "LayoutOrder를 쓰는 리스트에는 divide를 쓰지 말 것"을 명시.
- 구분선도 리스트 아이템이므로 `gap`이 구분선 양쪽에 적용된다 — CSS와 다름
  (CSS divide는 border라 gap과 독립). 근사임을 문서화.

### 판단

구현 난이도는 margin C안보다 낮지만(자식 배열 조작뿐), 수요가 불확실하고
LayoutOrder 제약이 사용자를 놀라게 할 수 있다. **margin이 안착한 뒤 같은
호스트 릴리스 사이클에서 진행**하는 것을 권장. 지금은 `divide` 패밀리를
no-roblox-equivalent에서 빼지 않는다.

---

## 열린 결정

1. margin C안(호스트 래퍼) 승인 여부 — 승인 시 Phase 4.1로 구현 착수.
2. divide를 4.1에 동시 포함할지, 4.2로 미룰지 (권장: 4.2).
