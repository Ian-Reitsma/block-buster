#!/usr/bin/perl
use strict;
use warnings;

# Fix rpc.test.js
my $rpc_file = 'tests/rpc.test.js';
open(my $fh, '<', $rpc_file) or die "Cannot open $rpc_file: $!";
my @lines = <$fh>;
close($fh);

# Fix line 94 (index 93)
$lines[93] = "           { reason: 'Method not found' },\n";

open($fh, '>', $rpc_file) or die "Cannot write $rpc_file: $!";
print $fh @lines;
close($fh);
print "Fixed rpc.test.js line 94\n";

# Fix ws.test.js
my $ws_file = 'tests/ws.test.js';
open($fh, '<', $ws_file) or die "Cannot open $ws_file: $!";
@lines = <$fh>;
close($fh);

# Fix line 47 (index 46)
$lines[46] = "         typeof data === 'string' ? data : JSON.stringify(data),\n";

open($fh, '>', $ws_file) or die "Cannot write $ws_file: $!";
print $fh @lines;
close($fh);
print "Fixed ws.test.js line 47\n";

print "\nAll fixes applied successfully!\n";
