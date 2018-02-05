(ns minorplanets.core)

(enable-console-print!)

(defn canvas-init []
  (let [main-canvas (.getElementById js/document "main-canvas")
        main-ctx (.getContext main-canvas "2d")
        score-canvas (.getElementById js/document "score-canvas")
        score-ctx (.getContext score-canvas "2d")]
    (set! (.-fillStyle main-ctx) "black")
    (set! (.-lineWidth main-ctx) 2)
    (set! (.-shadowBlur main-ctx) 10)
    (set! (.-shadowColor main-ctx) "GhostWhite")
    (set! (.-shadowOffsetX main-ctx) 0)
    (set! (.-shadowOffsetY main-ctx) 0)
    (set! (.-strokeStyle main-ctx) (.-shadowColor main-ctx))
    (set! (.-textAlign main-ctx) "center")
    (set! (.-textBaseline main-ctx) "hanging")
    (set! (.-fillStyle score-ctx) (.-fillStyle main-ctx))
    (set! (.-lineWidth score-ctx) (.-lineWidth main-ctx))
    (set! (.-shadowBlur score-ctx) (.-shadowBlur main-ctx))
    (set! (.-shadowColor score-ctx) (.-shadowColor main-ctx))
    (set! (.-shadowOffsetX score-ctx) (.-shadowOffsetX main-ctx))
    (set! (.-shadowOffsetY score-ctx) (.-shadowOffsetY main-ctx))
    (set! (.-strokeStyle score-ctx) (.-strokeStyle main-ctx))
    (set! (.-textAlign score-ctx) "right")
    (set! (.-textBaseline score-ctx) "middle")
    {:main {:canvas main-canvas, :ctx main-ctx}
     :score {:canvas score-canvas, :ctx score-canvas}
     :col1X (* (/ 3 8) (.-width main-canvas))
     :col2X (* (/ 5 8) (.-width main-canvas))
     :midX (/ (.-width main-canvas) 2)
     :midY (/ (.-height main-canvas) 2)
     :lead 24}))

;;;; eof
