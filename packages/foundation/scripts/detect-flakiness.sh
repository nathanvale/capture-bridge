#!/usr/bin/env bash

###############################################################################
# FLAKINESS DETECTION SCRIPT
# 
# Purpose: Run the test suite multiple times to detect flaky tests
# Usage:   ./scripts/detect-flakiness.sh [iterations] [test-pattern]
# Example: ./scripts/detect-flakiness.sh 10
#          ./scripts/detect-flakiness.sh 20 "testkit-sqlite"
###############################################################################

set -euo pipefail

# Configuration
ITERATIONS="${1:-10}"
TEST_PATTERN="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$PACKAGE_DIR/logs/flakiness"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RUN_ID="flakiness_${TIMESTAMP}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Ensure logs directory
mkdir -p "$LOGS_DIR"

# Summary files
SUMMARY_FILE="$LOGS_DIR/${RUN_ID}_summary.txt"
DETAILS_FILE="$LOGS_DIR/${RUN_ID}_details.txt"

# Tracking arrays
declare -a RUN_RESULTS=()
declare -a RUN_TIMES=()
declare -A TEST_FAILURES=()

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

print_header() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "$1"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
}

run_test_suite() {
  local run_number=$1
  local log_file="$LOGS_DIR/${RUN_ID}_run_${run_number}.log"
  
  log_info "Running test suite - Iteration $run_number/$ITERATIONS"
  
  local test_cmd="pnpm test"
  [[ -n "$TEST_PATTERN" ]] && test_cmd="$test_cmd -- $TEST_PATTERN"
  
  local start_time=$(date +%s)
  
  if cd "$PACKAGE_DIR" && $test_cmd > "$log_file" 2>&1; then
    RUN_RESULTS+=("PASS")
    local exit_code=0
  else
    RUN_RESULTS+=("FAIL")
    extract_failures "$log_file" "$run_number"
    local exit_code=$?
  fi
  
  local end_time=$(date +%s)
  local duration=$((end_time - start_time))
  RUN_TIMES+=("$duration")
  
  [[ $exit_code -eq 0 ]] && log_success "Run $run_number completed in ${duration}s" || log_error "Run $run_number failed in ${duration}s"
  
  return $exit_code
}

extract_failures() {
  local log_file=$1
  local run_number=$2
  
  while IFS= read -r line; do
    if [[ "$line" =~ FAIL[[:space:]]+(.+\.test\.ts) ]]; then
      local test_file="${BASH_REMATCH[1]}"
      TEST_FAILURES[$test_file]="${TEST_FAILURES[$test_file]:-}${TEST_FAILURES[$test_file]:+,}$run_number"
    fi
  done < "$log_file"
}

generate_summary() {
  print_header "FLAKINESS DETECTION SUMMARY"
  
  local passed_runs=0
  local failed_runs=0
  
  for result in "${RUN_RESULTS[@]}"; do
    [[ "$result" == "PASS" ]] && ((passed_runs++)) || ((failed_runs++))
  done
  
  local pass_rate=$((passed_runs * 100 / ITERATIONS))
  
  local total_time=0 min_time=999999 max_time=0
  for time in "${RUN_TIMES[@]}"; do
    ((total_time += time))
    [[ $time -lt $min_time ]] && min_time=$time
    [[ $time -gt $max_time ]] && max_time=$time
  done
  local avg_time=$((total_time / ITERATIONS))
  
  {
    echo "Run ID: $RUN_ID"
    echo "Timestamp: $(date)"
    echo "Test Pattern: ${TEST_PATTERN:-all tests}"
    echo ""
    echo "═══ Execution Summary ═══"
    echo "Total Runs:      $ITERATIONS"
    echo "Passed Runs:     $passed_runs ($pass_rate%)"
    echo "Failed Runs:     $failed_runs"
    echo ""
    echo "═══ Timing Statistics ═══"
    echo "Average Time:    ${avg_time}s"
    echo "Min Time:        ${min_time}s"
    echo "Max Time:        ${max_time}s"
    echo ""
    
    if [[ ${#TEST_FAILURES[@]} -gt 0 ]]; then
      echo "═══ Flaky Tests Detected ═══"
      for test in "${!TEST_FAILURES[@]}"; do
        local failures="${TEST_FAILURES[$test]}"
        local failure_count=$(echo "$failures" | tr ',' '\n' | wc -l | tr -d ' ')
        local failure_rate=$((failure_count * 100 / ITERATIONS))
        echo "Test: $test"
        echo "  Failures: $failure_count/$ITERATIONS ($failure_rate%)"
        echo "  Failed in runs: $failures"
        echo ""
      done
    else
      echo "✓ No flaky tests detected!"
    fi
  } | tee "$SUMMARY_FILE"
}

print_header "FLAKINESS DETECTION - Starting"
log_info "Iterations: $ITERATIONS | Test Pattern: ${TEST_PATTERN:-all}"

for ((i=1; i<=ITERATIONS; i++)); do
  run_test_suite "$i" || true
  [[ $i -lt $ITERATIONS ]] && sleep 1
done

generate_summary

print_header "FLAKINESS DETECTION - Complete"
[[ ${#TEST_FAILURES[@]} -gt 0 ]] && log_warning "Flaky tests detected!" && exit 1 || log_success "No flaky tests!" && exit 0
