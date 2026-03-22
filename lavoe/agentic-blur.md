"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

export function ShadowCanvas() {
const [showShadow, setShowShadow] = useState(false)
const [colorIndex, setColorIndex] = useState(0)

const colors = [
"rgba(255,165,0,0.3)", // Orange
"rgba(255,69,0,0.3)", // Red-Orange
"rgba(255,20,147,0.3)", // Deep Pink
"rgba(138,43,226,0.3)", // Blue Violet
"rgba(0,191,255,0.3)", // Deep Sky Blue
"rgba(0,255,127,0.3)", // Spring Green
"rgba(255,255,0,0.3)", // Yellow
"rgba(255,140,0,0.3)", // Dark Orange
]

const handleButtonClick = () => {
setShowShadow(true)
setColorIndex(0)

    const colorInterval = setInterval(() => {
      setColorIndex((prev) => (prev + 1) % colors.length)
    }, 1250)

    // Remove shadow after 10 seconds and clear interval
    setTimeout(() => {
      setShowShadow(false)
      clearInterval(colorInterval)
      setColorIndex(0)
    }, 10000)

}

return (
<div className="relative w-full h-screen bg-white">
{/_ Canvas area _/}
<div
className={`w-full h-full transition-all duration-1000 ${
          showShadow
            ? `shadow-[inset*0_0_100px_20px*${colors[colorIndex].replace("rgba", "rgb").replace(",0.3)", ")")}]`
            : ""
        }`}
style={{
          boxShadow: showShadow ? `inset 0 0 100px 20px ${colors[colorIndex]}` : "none",
        }} >
{/_ Button positioned in top-right corner _/}
<Button
          onClick={handleButtonClick}
          className="absolute top-4 right-4 bg-primary hover:bg-primary/90"
          disabled={showShadow}
        >
{showShadow ? "Colors Changing..." : "Add Shadow"}
</Button>
</div>
</div>
)
}
