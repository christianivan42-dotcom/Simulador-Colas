"""Validación cruzada del motor del simulador con Ciw (github.com/CiwPython/Ciw).

Ejecutar:  pip install ciw   y luego   python tests/validar_con_ciw.py
Compara la espera media en fila (Wq, minutos) de escenarios en estado estable.
Los valores del simulador web se obtienen con:  node tests/validacion.js
"""
import statistics
import sys

sys.stdout.reconfigure(encoding="utf-8")
import ciw

HORAS = 1500
CALENTAMIENTO = 50 * 60  # minutos
REPLICAS = 6


def correr(red, nombre):
    medias = []
    for semilla in range(REPLICAS):
        ciw.seed(semilla)
        sim = ciw.Simulation(red)
        sim.simulate_until_max_time(HORAS * 60)
        recs = [r for r in sim.get_all_records() if r.arrival_date > CALENTAMIENTO and r.record_type == "service"]
        medias.append(statistics.mean(r.waiting_time for r in recs))
    m = statistics.mean(medias)
    hw = 2.571 * statistics.stdev(medias) / len(medias) ** 0.5
    print(f"{nombre:<34} Wq = {m:7.3f} min  (IC 95 %: ±{hw:.3f})")
    return m


if __name__ == "__main__":
    print("Ciw", ciw.__version__)
    # M/M/3: λ = 60/h (1 por minuto), servicio exponencial de 2.5 min → teoría 3.511 min
    correr(ciw.create_network(
        arrival_distributions=[ciw.dists.Exponential(rate=1.0)],
        service_distributions=[ciw.dists.Exponential(rate=1 / 2.5)],
        number_of_servers=[3]), "M/M/3 (teoría 3.511)")
    # M/D/1: λ = 45/h, servicio constante 1 min → teoría 1.500 min
    correr(ciw.create_network(
        arrival_distributions=[ciw.dists.Exponential(rate=0.75)],
        service_distributions=[ciw.dists.Deterministic(value=1.0)],
        number_of_servers=[1]), "M/D/1 (teoría 1.500)")
    # E2/Gamma/2: llegadas Erlang-2 de media 1 min, servicio gamma media 1.7, d.e. 1.2
    forma, escala = (1.7 / 1.2) ** 2, 1.2 ** 2 / 1.7
    correr(ciw.create_network(
        arrival_distributions=[ciw.dists.Erlang(rate=2.0, num_phases=2)],
        service_distributions=[ciw.dists.Gamma(shape=forma, scale=escala)],
        number_of_servers=[2]), "E2/Gamma/2 (simulador web 2.113)")
