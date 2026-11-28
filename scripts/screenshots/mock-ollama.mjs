import http from 'node:http'

const MODELS = [
  {
    name: 'gpt-oss:latest',
    model: 'gpt-oss:latest',
    modified_at: '2026-11-15T10:00:00Z',
    size: 13793441566,
    digest: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    details: {
      parent_model: '',
      format: 'gguf',
      family: 'gpt-oss',
      families: ['gpt-oss'],
      parameter_size: '20B',
      quantization_level: 'Q4_K_M'
    }
  },
  {
    name: 'qwen3:latest',
    model: 'qwen3:latest',
    modified_at: '2026-11-10T10:00:00Z',
    size: 5225388164,
    digest: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
    details: {
      parent_model: '',
      format: 'gguf',
      family: 'qwen3',
      families: ['qwen3'],
      parameter_size: '8B',
      quantization_level: 'Q4_K_M'
    }
  },
  {
    name: 'nomic-embed-text:latest',
    model: 'nomic-embed-text:latest',
    modified_at: '2026-11-01T10:00:00Z',
    size: 274302450,
    digest: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
    details: {
      parent_model: '',
      format: 'gguf',
      family: 'nomic-bert',
      families: ['nomic-bert'],
      parameter_size: '137M',
      quantization_level: 'F16'
    }
  }
]

function topicEmbedding(text) {
  const s = String(text || '').toLowerCase()
  if (/weather|sky|blue|rayleigh|atmosphere|scatter|sunlight/.test(s)) {
    return [0.99, 0.05, 0.05, 0.05]
  }
  if (/wayland|portal|flatpak|sandbox|xdg/.test(s)) {
    return [0.05, 0.99, 0.05, 0.05]
  }
  if (/typescript|calculator|review|transfer|code|merge/.test(s)) {
    return [0.05, 0.05, 0.99, 0.05]
  }
  return [0.05, 0.05, 0.05, 0.99]
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
  })
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json')

  if (req.url === '/api/version') {
    res.end(JSON.stringify({ version: '0.12.0' }))
    return
  }

  if (req.url === '/api/tags') {
    res.end(JSON.stringify({ models: MODELS }))
    return
  }

  if (req.url === '/api/ps') {
    res.end(JSON.stringify({
      models: [
        {
          ...MODELS[0],
          expires_at: '2026-11-28T12:00:00Z',
          size_vram: 13793441566
        }
      ]
    }))
    return
  }

  if (req.url === '/api/show') {
    const body = await readJson(req)
    const name = body.model || body.name || 'gpt-oss:latest'
    const isEmbed = name.includes('embed')
    res.end(JSON.stringify({
      parameters: 'temperature 0.7',
      license: 'Apache-2.0',
      capabilities: isEmbed ? ['embedding'] : ['completion', 'tools', 'vision', 'thinking'],
      modified_at: '2026-11-15T10:00:00Z',
      details: {
        parent_model: '',
        format: 'gguf',
        family: isEmbed ? 'nomic-bert' : 'gpt-oss',
        families: [isEmbed ? 'nomic-bert' : 'gpt-oss'],
        parameter_size: isEmbed ? '137M' : '20B',
        quantization_level: 'Q4_K_M'
      },
      model_info: {
        'general.context_length': 32768
      }
    }))
    return
  }

  if (req.url === '/api/embed') {
    const body = await readJson(req)
    const inputs = Array.isArray(body.input) ? body.input : [body.input]
    res.end(JSON.stringify({
      model: body.model || 'nomic-embed-text:latest',
      embeddings: inputs.map(topicEmbedding),
      total_duration: 15000000,
      load_duration: 1000000,
      prompt_eval_count: 8
    }))
    return
  }

  res.statusCode = 404
  res.end(JSON.stringify({ error: 'not found' }))
})

server.listen(0, '127.0.0.1', () => {
  const addr = server.address()
  console.log(`http://127.0.0.1:${addr.port}`)
})
