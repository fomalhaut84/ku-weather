#!/bin/bash
echo "=== 현재 실행 중인 Node.js 프로세스 확인 ==="
ps aux | grep -E "node|ts-node" | grep -v grep

echo ""
echo "=== ku-weather 관련 프로세스 ==="
ps aux | grep -E "ku-weather|index.ts|index.js" | grep -v grep

echo ""
echo "=== 포트 사용 확인 (Node.js) ==="
lsof -i -P | grep node || echo "lsof 명령어 사용 불가 (권한 필요)"
