#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成单文件版 Linux内核学习器.html（CSS3D 模式全内联，双击即用，跨平台）"""
import re, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))

def read(p):
    with open(os.path.join(BASE, p), encoding='utf-8') as f:
        return f.read()

html = read('index.html')
css  = read('css/style.css')
three = read('js/three.min.js')
orbit = read('js/OrbitControls.js')
css3d = read('js/CSS3DRenderer.js')
data  = read('js/data.js')
data2 = read('js/data2.js')
data3 = read('js/data3.js')
ui    = read('js/ui.js')
main  = read('js/main-css3d.js')

# 1) CSS 内联
html = html.replace('<link rel="stylesheet" href="css/style.css?v=2">',
                    '<style>\n' + css + '\n</style>')

# 2) 外链脚本内联（CSS2DRenderer 不需要——CSS3D 版不用）
def inline(html, src_attr, content):
    # src_attr 形如 'js/three.min.js?v=2'
    pat = re.compile(r'<script src="' + re.escape(src_attr) + r'"></script>')
    return pat.sub(lambda m: '<script>\n' + content + '\n</script>', html)

html = inline(html, 'js/three.min.js?v=2', three)
html = inline(html, 'js/OrbitControls.js?v=2', orbit)
html = inline(html, 'js/CSS3DRenderer.js?v=2', css3d)
html = inline(html, 'js/data.js?v=2', data)
html = inline(html, 'js/data2.js?v=2', data2)
html = inline(html, 'js/data3.js?v=2', data3)
html = inline(html, 'js/ui.js?v=2', ui)

# 3) 移除不需要的 CSS2DRenderer 外链（CSS3D 版不使用）
html = re.sub(r'<script src="js/CSS2DRenderer\.js\?v=2"></script>\n?', '', html)

# 4) 动态选择脚本替换为直接执行 CSS3D 版
pat_choice = re.compile(r'<script>\n/\* 渲染模式自动选择.*?</script>', re.S)
html = pat_choice.sub('<script>\n' + main + '\n</script>', html)

# 5) 校验：不应再有外链脚本
left = re.findall(r'<script src="([^"]+)"', html)
if left:
    print('警告：仍有外链脚本:', left)

out = os.path.join(BASE, 'Linux内核学习器.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)
print('生成成功:', out, '%.1f KB' % (os.path.getsize(out) / 1024))
