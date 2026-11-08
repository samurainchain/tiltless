# Each reel as (on-screen subtitle, what the voice says). Voiced line by line with Piper so every
# line's start and end are known exactly; words inside a line are timed by their length.
import json, subprocess, sys, re
R = {
 '08': [
  ('Sube 1 captura y 6 campos se llenan solos.', 'Sube una captura, y seis campos se llenan solos.'),
  ('Una operación cerrada. Captura de ejemplo.', 'Una operación cerrada. Captura de ejemplo, en español.'),
  ('La sueltas en Tiltless.', 'La sueltas en Tíltles.'),
  ('Instrumento, dirección, apalancamiento.', 'Instrumento. Dirección. Apalancamiento.'),
  ('Entrada, salida, tamaño.', 'Entrada. Salida. Tamaño.'),
  ('Y el resultado: −$128.', 'Y el resultado: menos ciento veintiocho dólares.'),
  ('Revisas, guardas y tu diario sigue al día.', 'Revisas, guardas, y tu diario sigue al día.'),
  ('5 lecturas al mes gratis. Sin límite en Pro.', 'Cinco lecturas al mes, gratis. Sin límite en Pro.'),
  ('Sube 1 captura. Link en la bio.', 'Sube una captura. Link, en la bio.'),
 ],
 '09': [
  ('Con 52% de acierto, tus errores te costaron $1,340.', 'Con cincuenta y dos por ciento de acierto, tus errores te costaron mil trescientos cuarenta dólares.'),
  ('Mes de demostración.', 'Mes de demostración.'),
  ('52% de acierto. +$255.', 'Cincuenta y dos por ciento de acierto. Más doscientos cincuenta y cinco dólares.'),
  ('Parece bien. Ahora suma los errores.', 'Parece bien. Ahora suma los errores.'),
  ('Mala hora: −$332.', 'Mala hora: menos trescientos treinta y dos.'),
  ('Pasar el stop: −$280.', 'Pasar el stop: menos doscientos ochenta.'),
  ('FOMO: −$260.', 'Fomo: menos doscientos sesenta.'),
  ('Revancha: −$182.', 'Revancha: menos ciento ochenta y dos.'),
  ('7 tipos de error: −$1,340.', 'Siete tipos de error: menos mil trescientos cuarenta dólares.'),
  ('Tu acierto no es el problema.', 'Tu acierto no es el problema.'),
  ('Tus errores, sí. Link en la bio.', 'Tus errores, sí. Link, en la bio.'),
 ],
 '10': [
  ('Las 8 de la noche te costaron $800 este mes.', 'Las ocho de la noche te costaron ochocientos dólares este mes.'),
  ('Mes de demostración. PnL por hora de entrada.', 'Mes de demostración. Pe, ene, ele, por hora de entrada.'),
  ('8 de la noche: −$800.', 'Ocho de la noche: menos ochocientos dólares.'),
  ('9 de la mañana: +$710.', 'Nueve de la mañana: más setecientos diez.'),
  ('Mismo trader. Mismo mercado.', 'Mismo trader. Mismo mercado.'),
  ('Solo cambia la hora.', 'Solo cambia la hora.'),
  ('Tiltless marca cada operación en tu mala hora.', 'Tíltles marca cada operación en tu mala hora.'),
  ('Encuentra tu hora. Link en la bio.', 'Encuentra tu hora. Link, en la bio.'),
 ],
 '08g': [
  ('Tu diario de trading en 4 pasos.', 'Tu diario de trading, en cuatro pasos.'),
  ('1. Entra a tiltless.xyz.', 'Uno. Entra a la página de Tíltles.'),
  ('El diario es gratis y no pide tarjeta.', 'El diario es gratis, y no pide tarjeta.'),
  ('2. Responde 4 preguntas.', 'Dos. Responde cuatro preguntas.'),
  ('Qué buscas, qué operas, dónde pierdes más.', 'Qué buscas. Qué operas. Dónde pierdes más.'),
  ('Y cuántas operaciones haces por semana.', 'Y cuántas operaciones haces por semana.'),
  ('3. Registra tus operaciones: a mano o con una captura.', 'Tres. Registra tus operaciones: a mano, o con una captura.'),
  ('4. Mira qué te cuesta cada error, en dólares.', 'Cuatro. Mira qué te cuesta cada error, en dólares.'),
  ('Antes de operar, te recuerda tu peor hora.', 'Antes de operar, te recuerda tu peor hora.'),
  ('Y cada semana, un hábito a corregir.', 'Y cada semana, un hábito a corregir.'),
  ('El diario es gratis. Link en la bio.', 'El diario es gratis. Link, en la bio.'),
 ],
}
LEAD, GAP = 0.25, 0.32
PIPER = '../../penv/bin/piper'; MODEL = '../../piper/es_MX-claude-high.onnx'
dur = lambda f: float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f],capture_output=True,text=True).stdout)
for n in sys.argv[1:]:
    t, parts, out = LEAD, [], []
    for i, (sub, say) in enumerate(R[n]):
        f = f'lines/{n}-{i}.wav'
        subprocess.run([PIPER,'-m',MODEL,'-f',f,'--length-scale','0.95','--sentence-silence','0.18'], input=say.encode(), capture_output=True, check=True)
        # trim the model's own leading/trailing silence
        subprocess.run(['ffmpeg','-v','error','-y','-i',f,'-af','silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse','-ar','48000','-ac','2',f'lines/{n}-{i}t.wav'],check=True)
        d = dur(f'lines/{n}-{i}t.wav')
        words = sub.split(); total = sum(len(w) + 2 for w in words); s = t
        ws = []
        for w in words:
            e = s + d * (len(w) + 2) / total
            ws.append({'w': w, 's': round(s, 3), 'e': round(e, 3)}); s = e
        out.append({'line': sub, 's': round(t, 3), 'e': round(t + d, 3), 'words': ws})
        parts.append((f'lines/{n}-{i}t.wav', t)); t += d + GAP
    inputs, filt = [], []
    for k, (f, at) in enumerate(parts):
        inputs += ['-i', f]; filt.append(f'[{k}]adelay={int(at*1000)}|{int(at*1000)}[a{k}]')
    filt.append(''.join(f'[a{k}]' for k in range(len(parts))) + f'amix=inputs={len(parts)}:normalize=0,loudnorm=I=-16:TP=-1.5,aresample=48000[o]')
    subprocess.run(['ffmpeg','-v','error','-y',*inputs,'-filter_complex',';'.join(filt),'-map','[o]','-ac','2',f'vo-{n}.wav'],check=True)
    json.dump(out, open(f'lines-{n}.json','w'), ensure_ascii=False, indent=1)
    print(n, round(t - GAP + 0.1, 2), 's;', ' | '.join(f"{l['s']:.1f} {l['line'][:24]}" for l in out))
