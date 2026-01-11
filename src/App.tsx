import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Github, FolderOpen, File, ChevronDown, ChevronRight, Copy, Download, Trash2, Save, Upload, Globe, Settings, Minus } from 'lucide-react'

interface TreeItem {
  path: string
  type: string
  sha: string
  url: string
}

interface FileNode {
  name: string
  path: string
  url: string
  type: 'file'
  content?: string
}

interface DirectoryNode {
  name: string
  path: string
  type: 'directory'
  children: TreeNode[]
}

type TreeNode = FileNode | DirectoryNode

interface SavedPreferences {
  selectedPaths: string[]
  deselectedPaths: string[]
  timestamp: number
}

type UploadMode = 'local' | 'github'

const COMMON_EXTENSIONS = ['.js', '.py', '.java', '.cpp', '.html', '.css', '.ts', '.jsx', '.tsx', '.go', '.rs', '.rb', '.php']

function App() {
  const [mode, setMode] = useState<UploadMode>('local')
  const [repoUrl, setRepoUrl] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [tree, setTree] = useState<TreeNode[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [extensions, setExtensions] = useState<Map<string, boolean>>(new Map())
  const [outputText, setOutputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [repoKey, setRepoKey] = useState('')
  const [hasSavedPrefs, setHasSavedPrefs] = useState(false)
  const [localFiles, setLocalFiles] = useState<Map<string, File>>(new Map())
  const [directoryName, setDirectoryName] = useState('')
  const [savedProfiles, setSavedProfiles] = useState<{ key: string; name: string; timestamp: number; isLocal: boolean }[]>([])
  const [showProfiles, setShowProfiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadSavedProfiles = useCallback(() => {
    const profiles: { key: string; name: string; timestamp: number; isLocal: boolean }[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('repo2txt_prefs_') || key.startsWith('repo2txt_local_prefs_'))) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}')
          const isLocal = key.startsWith('repo2txt_local_prefs_')
          let name = key
          if (isLocal) {
            name = key.replace('repo2txt_local_prefs_', '').replace(/_/g, ' ')
          } else {
            name = key.replace('repo2txt_prefs_', '').replace('_', '/')
          }
          profiles.push({
            key,
            name,
            timestamp: data.timestamp || 0,
            isLocal
          })
        } catch {
          // Skip invalid entries
        }
      }
    }
    profiles.sort((a, b) => b.timestamp - a.timestamp)
    setSavedProfiles(profiles)
  }, [])

  const deleteProfile = (key: string) => {
    localStorage.removeItem(key)
    loadSavedProfiles()
    if (key === repoKey) {
      setHasSavedPrefs(false)
    }
  }

  useEffect(() => {
    const savedToken = localStorage.getItem('githubAccessToken')
    if (savedToken) {
      setAccessToken(savedToken)
    }
    loadSavedProfiles()
  }, [loadSavedProfiles])

  const getRepoKey = (identifier: string, isLocal: boolean): string => {
    if (isLocal) {
      return `repo2txt_local_prefs_${identifier.replace(/[^a-zA-Z0-9]/g, '_')}`
    }
    const match = identifier.match(/github\.com\/([^\/]+)\/([^\/]+)/)
    if (match) {
      return `repo2txt_prefs_${match[1]}_${match[2]}`
    }
    return ''
  }

  const getAllFilePaths = (nodes: TreeNode[]): string[] => {
    const paths: string[] = []
    const traverse = (node: TreeNode) => {
      if (node.type === 'file') {
        paths.push(node.path)
      } else {
        node.children.forEach(traverse)
      }
    }
    nodes.forEach(traverse)
    return paths
  }

  const savePreferences = useCallback(() => {
    if (!repoKey) return
    const prefs: SavedPreferences = {
      selectedPaths: Array.from(selectedFiles),
      deselectedPaths: getAllFilePaths(tree).filter(p => !selectedFiles.has(p)),
      timestamp: Date.now()
    }
    localStorage.setItem(repoKey, JSON.stringify(prefs))
    setHasSavedPrefs(true)
    loadSavedProfiles()
  }, [repoKey, selectedFiles, tree, loadSavedProfiles])

  const loadPreferences = useCallback((key: string, allPaths: string[]): Set<string> | null => {
    const saved = localStorage.getItem(key)
    if (!saved) return null
    
    try {
      const prefs: SavedPreferences = JSON.parse(saved)
      const selectedSet = new Set<string>()
      
      allPaths.forEach(path => {
        if (prefs.selectedPaths.includes(path)) {
          selectedSet.add(path)
        } else if (!prefs.deselectedPaths.includes(path)) {
          const ext = '.' + path.split('.').pop()?.toLowerCase()
          if (COMMON_EXTENSIONS.includes(ext)) {
            selectedSet.add(path)
          }
        }
      })
      
      return selectedSet
    } catch {
      return null
    }
  }, [])

  const clearPreferences = () => {
    if (repoKey) {
      localStorage.removeItem(repoKey)
      setHasSavedPrefs(false)
    }
  }

  const handleLocalDirectorySelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setLoading(true)
    setError('')
    setOutputText('')
    setTree([])
    setLocalFiles(new Map())

    try {
      const fileMap = new Map<string, File>()
      const paths: string[] = []
      let rootDirName = ''

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const relativePath = file.webkitRelativePath
        
        if (!rootDirName && relativePath) {
          rootDirName = relativePath.split('/')[0]
        }
        
        if (relativePath.includes('/.git/') || relativePath.includes('/node_modules/')) {
          continue
        }
        
        const normalizedPath = '/' + relativePath
        fileMap.set(normalizedPath, file)
        paths.push(normalizedPath)
      }

      setDirectoryName(rootDirName)
      setLocalFiles(fileMap)

      const treeStructure = buildTreeFromPaths(paths, rootDirName)
      setTree(treeStructure)

      const allPaths = getAllFilePaths(treeStructure)
      const key = getRepoKey(rootDirName, true)
      setRepoKey(key)

      const savedSelection = loadPreferences(key, allPaths)
      if (savedSelection) {
        setSelectedFiles(savedSelection)
        setHasSavedPrefs(true)
      } else {
        const defaultSelected = new Set<string>()
        allPaths.forEach(path => {
          const ext = '.' + path.split('.').pop()?.toLowerCase()
          if (COMMON_EXTENSIONS.includes(ext)) {
            defaultSelected.add(path)
          }
        })
        setSelectedFiles(defaultSelected)
        setHasSavedPrefs(false)
      }

      const extMap = new Map<string, boolean>()
      allPaths.forEach(path => {
        const ext = path.split('.').pop()?.toLowerCase() || ''
        if (!extMap.has(ext)) {
          extMap.set(ext, COMMON_EXTENSIONS.includes('.' + ext))
        }
      })
      setExtensions(extMap)

      setExpandedDirs(new Set(['./']))

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const buildTreeFromPaths = (paths: string[], rootName: string): TreeNode[] => {
    const root: DirectoryNode = { name: rootName || './', path: './', type: 'directory', children: [] }

    paths.forEach(fullPath => {
      const parts = fullPath.split('/').filter(Boolean)
      let current = root

      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          current.children.push({
            name: part,
            path: fullPath,
            url: '',
            type: 'file'
          })
        } else if (index > 0) {
          let dir = current.children.find(
            c => c.type === 'directory' && c.name === part
          ) as DirectoryNode | undefined

          if (!dir) {
            dir = {
              name: part,
              path: '/' + parts.slice(0, index + 1).join('/'),
              type: 'directory',
              children: []
            }
            current.children.push(dir)
          }
          current = dir
        }
      })
    })

    const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      }).map(node => {
        if (node.type === 'directory') {
          return { ...node, children: sortNodes(node.children) }
        }
        return node
      })
    }

    return [{ ...root, children: sortNodes(root.children) }]
  }

  const parseRepoUrl = (url: string): { owner: string; repo: string; ref: string; path: string } => {
    url = url.replace(/\/$/, '')
    const match = url.match(/^https:\/\/github\.com\/([^\/]+)\/([^\/]+)(\/tree\/([^\/]+)(\/(.*))?)?$/)
    if (!match) {
      throw new Error('Invalid GitHub repository URL')
    }
    return {
      owner: match[1],
      repo: match[2],
      ref: match[4] || '',
      path: match[6] || ''
    }
  }

  const fetchRepoTree = async () => {
    setLoading(true)
    setError('')
    setOutputText('')
    
    try {
      const { owner, repo, ref, path } = parseRepoUrl(repoUrl)
      
      if (accessToken) {
        localStorage.setItem('githubAccessToken', accessToken)
      } else {
        localStorage.removeItem('githubAccessToken')
      }

      const headers: HeadersInit = {
        'Accept': 'application/vnd.github.object+json'
      }
      if (accessToken) {
        headers['Authorization'] = `token ${accessToken}`
      }

      const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ''}`
      const contentsResponse = await fetch(contentsUrl, { headers })
      
      if (!contentsResponse.ok) {
        if (contentsResponse.status === 403) {
          throw new Error('GitHub API rate limit exceeded. Please provide an access token.')
        }
        if (contentsResponse.status === 404) {
          throw new Error('Repository not found. Please check the URL.')
        }
        throw new Error(`Failed to fetch repository: ${contentsResponse.status}`)
      }
      
      const contentsData = await contentsResponse.json()
      const sha = contentsData.sha

      const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`
      const treeResponse = await fetch(treeUrl, { 
        headers: {
          'Accept': 'application/vnd.github+json',
          ...(accessToken ? { 'Authorization': `token ${accessToken}` } : {})
        }
      })
      
      if (!treeResponse.ok) {
        throw new Error(`Failed to fetch tree: ${treeResponse.status}`)
      }
      
      const treeData = await treeResponse.json()
      const items: TreeItem[] = treeData.tree.filter((item: TreeItem) => item.type === 'blob')
      
      const treeStructure = buildTree(items)
      setTree(treeStructure)
      
      const allPaths = getAllFilePaths(treeStructure)
      const key = getRepoKey(repoUrl, false)
      setRepoKey(key)
      
      const savedSelection = loadPreferences(key, allPaths)
      if (savedSelection) {
        setSelectedFiles(savedSelection)
        setHasSavedPrefs(true)
      } else {
        const defaultSelected = new Set<string>()
        allPaths.forEach(path => {
          const ext = '.' + path.split('.').pop()?.toLowerCase()
          if (COMMON_EXTENSIONS.includes(ext)) {
            defaultSelected.add(path)
          }
        })
        setSelectedFiles(defaultSelected)
        setHasSavedPrefs(false)
      }
      
      const extMap = new Map<string, boolean>()
      allPaths.forEach(path => {
        const ext = path.split('.').pop()?.toLowerCase() || ''
        if (!extMap.has(ext)) {
          extMap.set(ext, COMMON_EXTENSIONS.includes('.' + ext))
        }
      })
      setExtensions(extMap)
      
      setExpandedDirs(new Set(['./']))
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const buildTree = (items: TreeItem[]): TreeNode[] => {
    const root: DirectoryNode = { name: './', path: './', type: 'directory', children: [] }
    
    items.forEach(item => {
      const parts = item.path.split('/')
      let current = root
      
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          current.children.push({
            name: part,
            path: '/' + item.path,
            url: item.url,
            type: 'file'
          })
        } else {
          let dir = current.children.find(
            c => c.type === 'directory' && c.name === part
          ) as DirectoryNode | undefined
          
          if (!dir) {
            dir = {
              name: part,
              path: '/' + parts.slice(0, index + 1).join('/'),
              type: 'directory',
              children: []
            }
            current.children.push(dir)
          }
          current = dir
        }
      })
    })
    
    const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      }).map(node => {
        if (node.type === 'directory') {
          return { ...node, children: sortNodes(node.children) }
        }
        return node
      })
    }
    
    return [{ ...root, children: sortNodes(root.children) }]
  }

  const toggleFile = (path: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const toggleDirectory = (node: DirectoryNode, selected: boolean) => {
    const paths = getAllFilePaths([node])
    setSelectedFiles(prev => {
      const next = new Set(prev)
      paths.forEach(path => {
        if (selected) {
          next.add(path)
        } else {
          next.delete(path)
        }
      })
      return next
    })
  }

  const toggleExpand = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const toggleExtension = (ext: string, checked: boolean) => {
    setExtensions(prev => new Map(prev).set(ext, checked))
    
    const allPaths = getAllFilePaths(tree)
    setSelectedFiles(prev => {
      const next = new Set(prev)
      allPaths.forEach(path => {
        if (path.endsWith('.' + ext)) {
          if (checked) {
            next.add(path)
          } else {
            next.delete(path)
          }
        }
      })
      return next
    })
  }

  const getDirectoryState = (node: DirectoryNode): 'checked' | 'unchecked' | 'indeterminate' => {
    const paths = getAllFilePaths([node])
    const selectedCount = paths.filter(p => selectedFiles.has(p)).length
    if (selectedCount === 0) return 'unchecked'
    if (selectedCount === paths.length) return 'checked'
    return 'indeterminate'
  }

  const generateText = async () => {
    setLoading(true)
    setError('')
    
    try {
      const selected = Array.from(selectedFiles)
      if (selected.length === 0) {
        throw new Error('No files selected')
      }

      let contents: { path: string; text: string }[]

      if (localFiles.size > 0) {
        contents = await Promise.all(
          selected.map(async path => {
            const file = localFiles.get(path)
            if (!file) throw new Error(`File not found: ${path}`)
            const text = await file.text()
            return { path, text }
          })
        )
      } else {
        const headers: HeadersInit = {
          'Accept': 'application/vnd.github.v3.raw'
        }
        if (accessToken) {
          headers['Authorization'] = `token ${accessToken}`
        }

        const findFileUrl = (path: string, nodes: TreeNode[]): string | null => {
          for (const node of nodes) {
            if (node.type === 'file' && node.path === path) {
              return node.url
            }
            if (node.type === 'directory') {
              const found = findFileUrl(path, node.children)
              if (found) return found
            }
          }
          return null
        }

        contents = await Promise.all(
          selected.map(async path => {
            const url = findFileUrl(path, tree)
            if (!url) throw new Error(`URL not found for ${path}`)
            
            const response = await fetch(url, { headers })
            if (!response.ok) {
              throw new Error(`Failed to fetch ${path}`)
            }
            const text = await response.text()
            return { path, text }
          })
        )
      }

      const treeIndex = buildTreeIndex(selected)
      let output = `Directory Structure:\n\n${treeIndex}\n`
      
      contents.sort((a, b) => a.path.localeCompare(b.path)).forEach(({ path, text }) => {
        output += `\n\n---\nFile: ${path}\n---\n\n${text}\n`
      })

      setOutputText(output)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const buildTreeIndex = (paths: string[]): string => {
    const tree: Record<string, unknown> = {}
    
    paths.sort().forEach(path => {
      const parts = path.split('/').filter(Boolean)
      let current: Record<string, unknown> = tree
      parts.forEach((part, i) => {
        if (i === parts.length - 1) {
          current[part] = null
        } else {
          if (!current[part]) current[part] = {}
          current = current[part] as Record<string, unknown>
        }
      })
    })

    const buildLines = (node: Record<string, unknown>, prefix = ''): string => {
      let result = ''
      const entries = Object.entries(node)
      entries.forEach(([name, subNode], index) => {
        const isLast = index === entries.length - 1
        const linePrefix = isLast ? '└── ' : '├── '
        const childPrefix = isLast ? '    ' : '│   '
        result += `${prefix}${linePrefix}${name}\n`
        if (subNode) {
          result += buildLines(subNode as Record<string, unknown>, `${prefix}${childPrefix}`)
        }
      })
      return result
    }

    return buildLines(tree)
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(outputText)
  }

  const downloadText = () => {
    const blob = new Blob([outputText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'repo-contents.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const renderTree = (nodes: TreeNode[], depth = 0): JSX.Element[] => {
    return nodes.map(node => {
      if (node.type === 'file') {
        return (
          <div key={node.path} className="flex items-center py-1" style={{ paddingLeft: `${depth * 20}px` }}>
            <Checkbox
              checked={selectedFiles.has(node.path)}
              onCheckedChange={() => toggleFile(node.path)}
              className="mr-2"
            />
            <File className="w-4 h-4 mr-1 text-gray-500" />
            <span className="text-sm">{node.name}</span>
          </div>
        )
      }

      const state = getDirectoryState(node)
      const isExpanded = expandedDirs.has(node.path)

      return (
        <div key={node.path}>
          <div className="flex items-center py-1" style={{ paddingLeft: `${depth * 20}px` }}>
            {state === 'indeterminate' ? (
              <button
                onClick={() => toggleDirectory(node, true)}
                className="mr-2 h-4 w-4 shrink-0 rounded-sm border border-zinc-900 bg-zinc-900 flex items-center justify-center shadow"
              >
                <Minus className="h-3 w-3 text-zinc-50" />
              </button>
            ) : (
              <Checkbox
                checked={state === 'checked'}
                onCheckedChange={(checked) => toggleDirectory(node, checked as boolean)}
                className="mr-2"
              />
            )}
            <button
              onClick={() => toggleExpand(node.path)}
              className="mr-1 focus:outline-none"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            <FolderOpen className="w-4 h-4 mr-1 text-yellow-500" />
            <span className="text-sm font-medium">{node.name}</span>
          </div>
          {isExpanded && (
            <div>
              {renderTree(node.children, depth + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-gray-800">Repo to LLM Text</h1>
            <a href="https://github.com/benpml/repo-to-llm-text" target="_blank" rel="noopener noreferrer">
              <Github className="w-6 h-6 text-gray-600 hover:text-gray-800" />
            </a>
          </div>
          <p className="text-gray-600 mb-4">Convert code repository into LLM-friendly plain text for prompting.</p>
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-blue-600">This version remembers your file selections!</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowProfiles(!showProfiles)}
              className="text-gray-600"
            >
              <Settings className="w-4 h-4 mr-1" />
              Saved Profiles ({savedProfiles.length})
            </Button>
          </div>

          {showProfiles && (
            <div className="mb-6 p-4 border rounded-lg bg-gray-50">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Saved Profiles</h3>
              {savedProfiles.length === 0 ? (
                <p className="text-sm text-gray-500">No saved profiles yet. Save preferences after selecting files to create a profile.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {savedProfiles.map(profile => (
                    <div key={profile.key} className="flex items-center justify-between p-2 bg-white rounded border">
                      <div className="flex items-center gap-2">
                        {profile.isLocal ? (
                          <Upload className="w-4 h-4 text-gray-400" />
                        ) : (
                          <Globe className="w-4 h-4 text-gray-400" />
                        )}
                        <span className="text-sm">{profile.name}</span>
                        <span className="text-xs text-gray-400">
                          {profile.timestamp ? new Date(profile.timestamp).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteProfile(profile.key)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <Tabs value={mode} onValueChange={(v) => setMode(v as UploadMode)} className="mb-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="local" className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Local Directory
              </TabsTrigger>
              <TabsTrigger value="github" className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                GitHub URL
              </TabsTrigger>
            </TabsList>
            <TabsContent value="local" className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Directory:</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleLocalDirectorySelect}
                  className="hidden"
                  {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  {loading ? 'Processing...' : directoryName ? `Selected: ${directoryName}` : 'Choose Directory'}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                Select a folder from your computer. Files in .git and node_modules folders are automatically excluded.
              </p>
            </TabsContent>
            <TabsContent value="github" className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GitHub URL:</label>
                <Input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Personal Access Token (optional - for private repos and higher rate limits):
                </label>
                <Input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                  className="w-full"
                />
              </div>

              <Button
                onClick={fetchRepoTree}
                disabled={loading || !repoUrl}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                {loading ? 'Fetching...' : 'Fetch Directory Structure'}
              </Button>
            </TabsContent>
          </Tabs>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {tree.length > 0 && (
            <>
              {hasSavedPrefs && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4 flex items-center justify-between">
                  <span>Restored your saved file preferences. You can modify and save again.</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearPreferences}
                    className="text-green-700 border-green-300 hover:bg-green-100"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-600 mb-2">Filter by file extensions:</label>
                <div className="flex flex-wrap gap-3">
                  {Array.from(extensions.entries())
                    .sort((a, b) => b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] ? 1 : -1)
                    .map(([ext, checked]) => (
                      <label key={ext} className="flex items-center text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => toggleExtension(ext, c as boolean)}
                          className="mr-1"
                        />
                        .{ext}
                      </label>
                    ))}
                </div>
              </div>

              <div className="border rounded-lg p-4 mb-4 max-h-96 overflow-y-auto bg-gray-50">
                {renderTree(tree)}
              </div>

              <div className="flex gap-2 mb-4">
                <Button
                  onClick={generateText}
                  disabled={loading || selectedFiles.size === 0}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <File className="w-4 h-4 mr-2" />
                  Generate Text File
                </Button>
                <Button
                  onClick={savePreferences}
                  variant="outline"
                  className="border-blue-300 text-blue-600 hover:bg-blue-50"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Preferences
                </Button>
              </div>
            </>
          )}

          {outputText && (
            <>
              <div className="flex gap-2 mb-2">
                <Button onClick={copyToClipboard} variant="outline" size="sm">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy to Clipboard
                </Button>
                <Button onClick={downloadText} variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
              <textarea
                value={outputText}
                readOnly
                className="w-full h-64 p-3 border rounded-lg font-mono text-sm bg-gray-50"
              />
            </>
          )}
        </div>

        <footer className="text-center text-gray-500 text-sm mt-6">
          Built with React + TypeScript. File preferences are saved locally in your browser.
        </footer>
      </div>
    </div>
  )
}

export default App
