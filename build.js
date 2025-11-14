const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { marked } = require('marked')

const getRepoName = () => {
  try {
    return execSync('git remote get-url origin', { encoding: 'utf8' }).split('/').pop().replace('.git', '').trim()
  } catch {
    return null
  }
}

const srcDir = 'src'
const buildDir = 'build'
const isDev = process.argv.includes('--dev')
const repoName = getRepoName()
const basePath = isDev || fs.existsSync('CNAME') ? '/' : `/${repoName}/`

const build = () => {
  fs.rmSync(buildDir, { force: true, recursive: true })
  fs.mkdirSync(buildDir, { recursive: true })

  const layout = fs.readFileSync(path.join(srcDir, 'layout.html'), 'utf8')
  const pages = JSON.parse(fs.readFileSync(path.join(srcDir, 'pages.json'), 'utf8'))

  const buildPage = (content, pageName, outputPath) => {
    const styles = fs.existsSync(path.join(srcDir, `${pageName}.css`))
      ? `<link rel="stylesheet" href="${pageName}.css" />`
      : ''
    const scripts = fs.existsSync(path.join(srcDir, `${pageName}.js`))
      ? `<script defer src="${pageName}.js"></script>`
      : ''
    const replacements = {
      ...Object.fromEntries(Object.keys(pages).map(p => [`${p}-active`, p === pageName ? 'aria-current="page"' : ''])),
      base: basePath,
      content,
      ...pages['index'],
      ...pages[pageName],
      scripts,
      styles,
    }
    const html = Object.keys(replacements).reduce(
      (acc, key) => acc.replace(new RegExp(`{${key}}`, 'g'), replacements[key]),
      layout,
    )
    fs.writeFileSync(outputPath, html)
  }

  const processDir = (dir, outputDir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const srcPath = path.join(dir, entry.name)
      const relPath = path.relative(srcDir, srcPath)

      if (entry.name === 'layout.html') return

      if (entry.isDirectory()) {
        const newOutputDir = path.join(outputDir, entry.name)
        fs.mkdirSync(newOutputDir, { recursive: true })
        processDir(srcPath, newOutputDir)
      } else if (entry.name === 'page.html') {
        let content = fs.readFileSync(srcPath, 'utf8')
        const dirPath = path.relative(srcDir, dir)
        const pageName = dirPath || 'index'
        const postsJsonPath = path.join(dir, 'posts.json')
        if (fs.existsSync(postsJsonPath)) {
          const posts = JSON.parse(fs.readFileSync(postsJsonPath, 'utf8'))
          const postsHtml = Object.keys(posts)
            .sort()
            .reverse()
            .map(
              d =>
                `<a class="post" href="/${pageName}/${d}/"><h3>${posts[d].title}</h3><p>${posts[d].description}</p><time>${d}</time></a>`,
            )
            .join('\n')
          content = content.replace('{posts}', postsHtml)
        }
        buildPage(content, pageName, path.join(outputDir, 'index.html'))
        console.log(`✅ ${relPath} → ${path.relative(buildDir, outputDir)}/index.html`)
      } else if (entry.name.endsWith('.html')) {
        const content = fs.readFileSync(srcPath, 'utf8')
        const pageName = entry.name.replace('.html', '')
        const pageDir = path.join(outputDir, pageName)
        fs.mkdirSync(pageDir, { recursive: true })
        buildPage(content, pageName, path.join(pageDir, 'index.html'))
        console.log(`✅ ${relPath} → ${pageName}/index.html`)
      } else {
        fs.copyFileSync(srcPath, path.join(outputDir, entry.name))
        console.log(`📄 ${relPath}`)
      }
    })
  }

  processDir(srcDir, buildDir)

  const buildPosts = dir => {
    const postsJsonPath = path.join(dir, 'posts.json')
    if (!fs.existsSync(postsJsonPath)) return
    const posts = JSON.parse(fs.readFileSync(postsJsonPath, 'utf8'))
    const pageName = path.relative(srcDir, dir)
    Object.keys(posts).forEach(date => {
      const mdPath = path.join(dir, `${date}.md`)
      if (!fs.existsSync(mdPath)) return
      const postDir = path.join(buildDir, pageName, date)
      fs.mkdirSync(postDir, { recursive: true })
      const content = `<article class="layer"><div class="layer-inset">${marked(fs.readFileSync(mdPath, 'utf8'))}</div></article>`
      buildPage(content, pageName, path.join(postDir, 'index.html'))
      console.log(`📝 ${pageName}/${date}.md → ${pageName}/${date}/index.html`)
    })
  }

  fs.readdirSync(srcDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .forEach(e => buildPosts(path.join(srcDir, e.name)))

  console.log('\n✨ Formatting all files')
  execSync('npx prettier --write .', { stdio: 'inherit' })

  console.log(`\n🎉 Build complete! ${isDev ? '(dev mode)' : ''}`)
}

build()

if (process.argv.includes('--watch')) {
  let timeout
  fs.watch(srcDir, { recursive: true }, () => {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      console.log('\n🔄 Rebuilding')
      build()
    }, 100)
  })
  console.log('👀 Watching for changes')
}
