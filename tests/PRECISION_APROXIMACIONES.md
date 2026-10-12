# Precisión de las fórmulas aproximadas

Generado con `node tests/precision_aproximaciones.js` (2026-10-08, 4.5 min).

Cada fórmula aproximada se compara con una simulación larga en estado estable (≈ 250 000 clientes por réplica, 6 réplicas, 5 % de calentamiento). El simulador está validado contra fórmulas exactas en `tests/validacion.js` y contra la biblioteca independiente Ciw. Error = (fórmula − simulación) / simulación. Servicio medio de 1 minuto.

## Resumen

| Fórmula | Casos | Error absoluto mediano | Percentil 90 | Máximo |
|---|---:|---:|---:|---:|
| M/G/c (dos momentos) | 36 | 6,1 % | 24,8 % | 37,8 % |
| G/G/1 (Kingman + KLB) | 30 | 3,1 % | 4,9 % | 5,8 % |
| G/G/c (Allen-Cunneen) | 24 | 6,3 % | 25,3 % | 48,7 % |
| M/G/1 percentil 90 (gamma) | 8 | 0,6 % | 4,6 % | 7,8 % |
| Red en serie (QNA) | 6 | 2,2 % | 4,2 % | 5,7 % |

## Detalle

| Fórmula | Caso | Fórmula (min) | Simulación (min) | IC 95 % | Error | Nota |
|---|---|---:|---:|---:|---:|---|
| M/G/c (dos momentos) | c=2, ρ=0.5, servicio D (Cs²=0) | 0.1667 | 0.1776 | ± 0.0033 | -6,2 % | NS(1 min): fórmula 95.5 % vs sim 96.1 % |
| M/G/c (dos momentos) | c=2, ρ=0.5, servicio E₂ (Cs²=0,5) | 0.2500 | 0.2552 | ± 0.0037 | -2,0 % | NS(1 min): fórmula 91.2 % vs sim 90.9 % |
| M/G/c (dos momentos) | c=2, ρ=0.5, servicio LN (Cs²=2) | 0.5000 | 0.4497 | ± 0.0149 | +11,2 % | NS(1 min): fórmula 82.9 % vs sim 86.1 % |
| M/G/c (dos momentos) | c=2, ρ=0.5, servicio H₂ (Cs²=2) | 0.5000 | 0.4684 | ± 0.0116 | +6,7 % | NS(1 min): fórmula 82.9 % vs sim 85.1 % |
| M/G/c (dos momentos) | c=2, ρ=0.7, servicio D (Cs²=0) | 0.4804 | 0.4957 | ± 0.0107 | -3,1 % | NS(1 min): fórmula 82.6 % vs sim 82.3 % |
| M/G/c (dos momentos) | c=2, ρ=0.7, servicio E₂ (Cs²=0,5) | 0.7206 | 0.7282 | ± 0.0139 | -1,0 % | NS(1 min): fórmula 74.1 % vs sim 73.3 % |
| M/G/c (dos momentos) | c=2, ρ=0.7, servicio LN (Cs²=2) | 1.4412 | 1.3730 | ± 0.0650 | +5,0 % | NS(1 min): fórmula 61.4 % vs sim 65.8 % |
| M/G/c (dos momentos) | c=2, ρ=0.7, servicio H₂ (Cs²=2) | 1.4412 | 1.3919 | ± 0.0429 | +3,5 % | NS(1 min): fórmula 61.4 % vs sim 64.3 % |
| M/G/c (dos momentos) | c=2, ρ=0.85, servicio D (Cs²=0) | 1.3018 | 1.3263 | ± 0.0504 | -1,8 % | NS(1 min): fórmula 57.1 % vs sim 55.4 % |
| M/G/c (dos momentos) | c=2, ρ=0.85, servicio E₂ (Cs²=0,5) | 1.9527 | 1.9802 | ± 0.0756 | -1,4 % | NS(1 min): fórmula 47.6 % vs sim 46.4 % |
| M/G/c (dos momentos) | c=2, ρ=0.85, servicio LN (Cs²=2) | 3.9054 | 3.7876 | ± 0.1798 | +3,1 % | NS(1 min): fórmula 36.1 % vs sim 39.9 % |
| M/G/c (dos momentos) | c=2, ρ=0.85, servicio H₂ (Cs²=2) | 3.9054 | 3.8513 | ± 0.1426 | +1,4 % | NS(1 min): fórmula 36.1 % vs sim 38.3 % |
| M/G/c (dos momentos) | c=5, ρ=0.5, servicio D (Cs²=0) | 0.0261 | 0.0309 | ± 0.0010 | -15,6 % | NS(1 min): fórmula 99.9 % vs sim 99.9 % |
| M/G/c (dos momentos) | c=5, ρ=0.5, servicio E₂ (Cs²=0,5) | 0.0391 | 0.0415 | ± 0.0011 | -5,8 % | NS(1 min): fórmula 99.5 % vs sim 99.5 % |
| M/G/c (dos momentos) | c=5, ρ=0.5, servicio LN (Cs²=2) | 0.0782 | 0.0619 | ± 0.0035 | +26,4 % | NS(1 min): fórmula 97.5 % vs sim 98.4 % |
| M/G/c (dos momentos) | c=5, ρ=0.5, servicio H₂ (Cs²=2) | 0.0782 | 0.0663 | ± 0.0033 | +18,1 % | NS(1 min): fórmula 97.5 % vs sim 98.2 % |
| M/G/c (dos momentos) | c=5, ρ=0.7, servicio D (Cs²=0) | 0.1259 | 0.1363 | ± 0.0038 | -7,6 % | NS(1 min): fórmula 98.1 % vs sim 98.2 % |
| M/G/c (dos momentos) | c=5, ρ=0.7, servicio E₂ (Cs²=0,5) | 0.1889 | 0.1944 | ± 0.0049 | -2,8 % | NS(1 min): fórmula 94.9 % vs sim 94.7 % |
| M/G/c (dos momentos) | c=5, ρ=0.7, servicio LN (Cs²=2) | 0.3778 | 0.3299 | ± 0.0212 | +14,5 % | NS(1 min): fórmula 86.1 % vs sim 88.9 % |
| M/G/c (dos momentos) | c=5, ρ=0.7, servicio H₂ (Cs²=2) | 0.3778 | 0.3467 | ± 0.0137 | +9,0 % | NS(1 min): fórmula 86.1 % vs sim 87.9 % |
| M/G/c (dos momentos) | c=5, ρ=0.85, servicio D (Cs²=0) | 0.4363 | 0.4532 | ± 0.0199 | -3,7 % | NS(1 min): fórmula 85.4 % vs sim 84.9 % |
| M/G/c (dos momentos) | c=5, ρ=0.85, servicio E₂ (Cs²=0,5) | 0.6545 | 0.6695 | ± 0.0289 | -2,2 % | NS(1 min): fórmula 75.9 % vs sim 75.2 % |
| M/G/c (dos momentos) | c=5, ρ=0.85, servicio LN (Cs²=2) | 1.3089 | 1.2069 | ± 0.0730 | +8,5 % | NS(1 min): fórmula 60.3 % vs sim 64.2 % |
| M/G/c (dos momentos) | c=5, ρ=0.85, servicio H₂ (Cs²=2) | 1.3089 | 1.2630 | ± 0.0485 | +3,6 % | NS(1 min): fórmula 60.3 % vs sim 62.4 % |
| M/G/c (dos momentos) | c=10, ρ=0.5, servicio D (Cs²=0) | 0.0036 | 0.0048 | ± 0.0003 | -25,5 % | NS(1 min): fórmula 100.0 % vs sim 100.0 % |
| M/G/c (dos momentos) | c=10, ρ=0.5, servicio E₂ (Cs²=0,5) | 0.0054 | 0.0059 | ± 0.0004 | -7,6 % | NS(1 min): fórmula 100.0 % vs sim 100.0 % |
| M/G/c (dos momentos) | c=10, ρ=0.5, servicio LN (Cs²=2) | 0.0108 | 0.0079 | ± 0.0007 | +37,8 % | NS(1 min): fórmula 99.9 % vs sim 99.9 % |
| M/G/c (dos momentos) | c=10, ρ=0.5, servicio H₂ (Cs²=2) | 0.0108 | 0.0085 | ± 0.0007 | +27,4 % | NS(1 min): fórmula 99.9 % vs sim 99.9 % |
| M/G/c (dos momentos) | c=10, ρ=0.7, servicio D (Cs²=0) | 0.0370 | 0.0422 | ± 0.0018 | -12,5 % | NS(1 min): fórmula 99.9 % vs sim 100.0 % |
| M/G/c (dos momentos) | c=10, ρ=0.7, servicio E₂ (Cs²=0,5) | 0.0554 | 0.0579 | ± 0.0024 | -4,3 % | NS(1 min): fórmula 99.6 % vs sim 99.6 % |
| M/G/c (dos momentos) | c=10, ρ=0.7, servicio LN (Cs²=2) | 0.1109 | 0.0894 | ± 0.0069 | +24,0 % | NS(1 min): fórmula 97.0 % vs sim 98.0 % |
| M/G/c (dos momentos) | c=10, ρ=0.7, servicio H₂ (Cs²=2) | 0.1109 | 0.0971 | ± 0.0048 | +14,2 % | NS(1 min): fórmula 97.0 % vs sim 97.6 % |
| M/G/c (dos momentos) | c=10, ρ=0.85, servicio D (Cs²=0) | 0.1766 | 0.1873 | ± 0.0099 | -5,7 % | NS(1 min): fórmula 97.4 % vs sim 97.3 % |
| M/G/c (dos momentos) | c=10, ρ=0.85, servicio E₂ (Cs²=0,5) | 0.2649 | 0.2733 | ± 0.0142 | -3,1 % | NS(1 min): fórmula 92.8 % vs sim 92.6 % |
| M/G/c (dos momentos) | c=10, ρ=0.85, servicio LN (Cs²=2) | 0.5299 | 0.4624 | ± 0.0311 | +14,6 % | NS(1 min): fórmula 80.5 % vs sim 84.0 % |
| M/G/c (dos momentos) | c=10, ρ=0.85, servicio H₂ (Cs²=2) | 0.5299 | 0.4998 | ± 0.0230 | +6,0 % | NS(1 min): fórmula 80.5 % vs sim 82.0 % |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio D (Cs²=0), ρ=0.6 | 0.3003 | 0.2947 | ± 0.0020 | +1,9 % |  |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio D (Cs²=0), ρ=0.8 | 0.9200 | 0.9070 | ± 0.0099 | +1,4 % |  |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio D (Cs²=0), ρ=0.9 | 2.1682 | 2.1492 | ± 0.0345 | +0,9 % |  |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio E₂ (Cs²=0,5), ρ=0.6 | 0.6711 | 0.6341 | ± 0.0066 | +5,8 % |  |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio E₂ (Cs²=0,5), ρ=0.8 | 1.9184 | 1.8760 | ± 0.0342 | +2,3 % |  |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio E₂ (Cs²=0,5), ρ=0.9 | 4.4174 | 4.4189 | ± 0.1420 | -0,0 % |  |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio M (Cs²=1), ρ=0.6 | 1.0447 | 0.9888 | ± 0.0100 | +5,6 % |  |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio M (Cs²=1), ρ=0.8 | 2.9178 | 2.8385 | ± 0.0529 | +2,8 % |  |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio M (Cs²=1), ρ=0.9 | 6.6672 | 6.5928 | ± 0.2854 | +1,1 % |  |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio LN (Cs²=2), ρ=0.6 | 1.7935 | 1.7367 | ± 0.0742 | +3,3 % |  |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio LN (Cs²=2), ρ=0.8 | 4.9174 | 4.8296 | ± 0.2847 | +1,8 % |  |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio LN (Cs²=2), ρ=0.9 | 11.1670 | 10.8423 | ± 0.6725 | +3,0 % |  |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio H₂ (Cs²=2), ρ=0.6 | 1.7935 | 1.7102 | ± 0.0223 | +4,9 % |  |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio H₂ (Cs²=2), ρ=0.8 | 4.9174 | 4.8261 | ± 0.0964 | +1,9 % |  |
| G/G/1 (Kingman + KLB) | llegadas E₂ (Ca²=0,5), servicio H₂ (Cs²=2), ρ=0.9 | 11.1670 | 11.2066 | ± 0.5834 | -0,4 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio D (Cs²=0), ρ=0.6 | 1.2281 | 1.2931 | ± 0.0110 | -5,0 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio D (Cs²=0), ρ=0.8 | 3.6193 | 3.8003 | ± 0.0775 | -4,8 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio D (Cs²=0), ρ=0.9 | 8.5611 | 8.8764 | ± 0.3209 | -3,6 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio E₂ (Cs²=0,5), ρ=0.6 | 1.6966 | 1.7704 | ± 0.0141 | -4,2 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio E₂ (Cs²=0,5), ρ=0.8 | 4.7561 | 4.9175 | ± 0.0754 | -3,3 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio E₂ (Cs²=0,5), ρ=0.9 | 10.9722 | 11.3210 | ± 0.5407 | -3,1 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio M (Cs²=1), ρ=0.6 | 2.1049 | 2.1920 | ± 0.0345 | -4,0 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio M (Cs²=1), ρ=0.8 | 5.8033 | 5.9922 | ± 0.2116 | -3,2 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio M (Cs²=1), ρ=0.9 | 13.2769 | 13.7888 | ± 1.2283 | -3,7 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio LN (Cs²=2), ρ=0.6 | 2.8824 | 2.9827 | ± 0.0893 | -3,4 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio LN (Cs²=2), ρ=0.8 | 7.8416 | 7.8615 | ± 0.2872 | -0,3 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio LN (Cs²=2), ρ=0.9 | 17.8209 | 17.2445 | ± 0.3634 | +3,3 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio H₂ (Cs²=2), ρ=0.6 | 2.8824 | 2.9765 | ± 0.0439 | -3,2 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio H₂ (Cs²=2), ρ=0.8 | 7.8416 | 7.9415 | ± 0.1434 | -1,3 % |  |
| G/G/1 (Kingman + KLB) | llegadas H₂ (Ca²=2), servicio H₂ (Cs²=2), ρ=0.9 | 17.8209 | 18.0733 | ± 0.6675 | -1,4 % |  |
| G/G/c (Allen-Cunneen) | c=2, llegadas E₂ (Ca²=0,5), servicio D (Cs²=0), ρ=0.7 | 0.2402 | 0.1910 | ± 0.0023 | +25,7 % |  |
| G/G/c (Allen-Cunneen) | c=2, llegadas E₂ (Ca²=0,5), servicio D (Cs²=0), ρ=0.9 | 1.0658 | 1.0015 | ± 0.0173 | +6,4 % |  |
| G/G/c (Allen-Cunneen) | c=2, llegadas E₂ (Ca²=0,5), servicio M (Cs²=1), ρ=0.7 | 0.7206 | 0.6359 | ± 0.0088 | +13,3 % |  |
| G/G/c (Allen-Cunneen) | c=2, llegadas E₂ (Ca²=0,5), servicio M (Cs²=1), ρ=0.9 | 3.1974 | 3.0951 | ± 0.1423 | +3,3 % |  |
| G/G/c (Allen-Cunneen) | c=2, llegadas E₂ (Ca²=0,5), servicio LN (Cs²=2), ρ=0.7 | 1.2010 | 1.0373 | ± 0.0587 | +15,8 % |  |
| G/G/c (Allen-Cunneen) | c=2, llegadas E₂ (Ca²=0,5), servicio LN (Cs²=2), ρ=0.9 | 5.3289 | 5.0124 | ± 0.3292 | +6,3 % |  |
| G/G/c (Allen-Cunneen) | c=2, llegadas H₂ (Ca²=2), servicio D (Cs²=0), ρ=0.7 | 0.9608 | 0.9536 | ± 0.0111 | +0,8 % |  |
| G/G/c (Allen-Cunneen) | c=2, llegadas H₂ (Ca²=2), servicio D (Cs²=0), ρ=0.9 | 4.2632 | 4.3198 | ± 0.1603 | -1,3 % |  |
| G/G/c (Allen-Cunneen) | c=2, llegadas H₂ (Ca²=2), servicio M (Cs²=1), ρ=0.7 | 1.4412 | 1.4854 | ± 0.0408 | -3,0 % |  |
| G/G/c (Allen-Cunneen) | c=2, llegadas H₂ (Ca²=2), servicio M (Cs²=1), ρ=0.9 | 6.3947 | 6.6229 | ± 0.6151 | -3,4 % |  |
| G/G/c (Allen-Cunneen) | c=2, llegadas H₂ (Ca²=2), servicio LN (Cs²=2), ρ=0.7 | 1.9216 | 1.9049 | ± 0.0741 | +0,9 % |  |
| G/G/c (Allen-Cunneen) | c=2, llegadas H₂ (Ca²=2), servicio LN (Cs²=2), ρ=0.9 | 8.5263 | 8.1572 | ± 0.1880 | +4,5 % |  |
| G/G/c (Allen-Cunneen) | c=5, llegadas E₂ (Ca²=0,5), servicio D (Cs²=0), ρ=0.7 | 0.0630 | 0.0424 | ± 0.0007 | +48,7 % |  |
| G/G/c (Allen-Cunneen) | c=5, llegadas E₂ (Ca²=0,5), servicio D (Cs²=0), ρ=0.9 | 0.3812 | 0.3452 | ± 0.0066 | +10,5 % |  |
| G/G/c (Allen-Cunneen) | c=5, llegadas E₂ (Ca²=0,5), servicio M (Cs²=1), ρ=0.7 | 0.1889 | 0.1519 | ± 0.0030 | +24,3 % |  |
| G/G/c (Allen-Cunneen) | c=5, llegadas E₂ (Ca²=0,5), servicio M (Cs²=1), ρ=0.9 | 1.1437 | 1.0849 | ± 0.0532 | +5,4 % |  |
| G/G/c (Allen-Cunneen) | c=5, llegadas E₂ (Ca²=0,5), servicio LN (Cs²=2), ρ=0.7 | 0.3149 | 0.2233 | ± 0.0166 | +41,0 % |  |
| G/G/c (Allen-Cunneen) | c=5, llegadas E₂ (Ca²=0,5), servicio LN (Cs²=2), ρ=0.9 | 1.9062 | 1.6933 | ± 0.1242 | +12,6 % |  |
| G/G/c (Allen-Cunneen) | c=5, llegadas H₂ (Ca²=2), servicio D (Cs²=0), ρ=0.7 | 0.2519 | 0.3004 | ± 0.0047 | -16,2 % |  |
| G/G/c (Allen-Cunneen) | c=5, llegadas H₂ (Ca²=2), servicio D (Cs²=0), ρ=0.9 | 1.5250 | 1.6261 | ± 0.0644 | -6,2 % |  |
| G/G/c (Allen-Cunneen) | c=5, llegadas H₂ (Ca²=2), servicio M (Cs²=1), ρ=0.7 | 0.3778 | 0.4261 | ± 0.0153 | -11,3 % |  |
| G/G/c (Allen-Cunneen) | c=5, llegadas H₂ (Ca²=2), servicio M (Cs²=1), ρ=0.9 | 2.2875 | 2.4314 | ± 0.2509 | -5,9 % |  |
| G/G/c (Allen-Cunneen) | c=5, llegadas H₂ (Ca²=2), servicio LN (Cs²=2), ρ=0.7 | 0.5038 | 0.5045 | ± 0.0242 | -0,1 % |  |
| G/G/c (Allen-Cunneen) | c=5, llegadas H₂ (Ca²=2), servicio LN (Cs²=2), ρ=0.9 | 3.0500 | 2.9058 | ± 0.0792 | +5,0 % |  |
| M/G/1 percentil 90 (gamma) | servicio D (Cs²=0), ρ=0.6 | 2.1433 | 2.1045 | ± 0.0344 | +1,8 % |  |
| M/G/1 percentil 90 (gamma) | servicio D (Cs²=0), ρ=0.85 | 6.9732 | 6.9843 | ± 0.2956 | -0,2 % |  |
| M/G/1 percentil 90 (gamma) | servicio E₂ (Cs²=0,5), ρ=0.6 | 3.3172 | 3.3043 | ± 0.0343 | +0,4 % |  |
| M/G/1 percentil 90 (gamma) | servicio E₂ (Cs²=0,5), ρ=0.85 | 10.6226 | 10.6529 | ± 0.4362 | -0,3 % |  |
| M/G/1 percentil 90 (gamma) | servicio LN (Cs²=2), ρ=0.6 | 7.1356 | 6.6210 | ± 0.1745 | +7,8 % |  |
| M/G/1 percentil 90 (gamma) | servicio LN (Cs²=2), ρ=0.85 | 22.6103 | 21.9059 | ± 0.9975 | +3,2 % |  |
| M/G/1 percentil 90 (gamma) | servicio H₂ (Cs²=2), ρ=0.6 | 6.9179 | 6.9674 | ± 0.1287 | -0,7 % |  |
| M/G/1 percentil 90 (gamma) | servicio H₂ (Cs²=2), ρ=0.85 | 21.8397 | 21.9656 | ± 0.8072 | -0,6 % |  |
| Red en serie (QNA) | D (Cs²=0) → LN (Cs²=2) (2 servidores), ρ=0.7 | 3.5782 | 3.4858 | ± 0.1212 | +2,7 % |  |
| Red en serie (QNA) | D (Cs²=0) → LN (Cs²=2) (2 servidores), ρ=0.85 | 8.7630 | 9.2936 | ± 0.3706 | -5,7 % |  |
| Red en serie (QNA) | LN (Cs²=2) → D (Cs²=0) (2 servidores), ρ=0.7 | 4.9316 | 5.0317 | ± 0.1509 | -2,0 % |  |
| Red en serie (QNA) | LN (Cs²=2) → D (Cs²=0) (2 servidores), ρ=0.85 | 12.9847 | 12.7400 | ± 0.4358 | +1,9 % |  |
| Red en serie (QNA) | E₂ (Cs²=0,5) → E₂ (Cs²=0,5) (2 servidores), ρ=0.7 | 2.9558 | 2.9237 | ± 0.0532 | +1,1 % |  |
| Red en serie (QNA) | E₂ (Cs²=0,5) → E₂ (Cs²=0,5) (2 servidores), ρ=0.85 | 7.2149 | 7.3882 | ± 0.2903 | -2,3 % |  |
