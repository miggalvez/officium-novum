#!/usr/bin/env perl
use strict;
use warnings;
no warnings 'once';
use utf8;
use Cwd qw(abs_path);
use File::Basename qw(dirname);
use JSON::PP;
use URI::Escape qw(uri_escape);

BEGIN {
  no warnings 'redefine';
  *CORE::GLOBAL::exit = sub { die "__EXIT__\n"; };
}

my ($version, $date, $hour) = @ARGV;
if (!defined $version || !defined $date || !defined $hour) {
  die "usage: officium-snapshot.pl <version> <MM-DD-YYYY> <Laudes|Vespera|Matutinum|Completorium>\n";
}

my $script_dir = dirname(abs_path(__FILE__));
my $officium = abs_path("$script_dir/../../../../upstream/web/cgi-bin/horas/officium.pl");
if (!defined $officium || !-f $officium) {
  die "cannot locate officium.pl from $script_dir\n";
}

my $query = join('&',
  "command=pray$hour",
  "date=$date",
  'version=' . uri_escape($version),
  'lang1=Latin',
  'lang2=English',
  'votive=',
  'testmode=1',
  'content=1'
);

local $ENV{REQUEST_METHOD} = 'GET';
local $ENV{QUERY_STRING} = $query;
local $0 = $officium;

my $html = '';
{
  local *STDOUT;
  open STDOUT, '>', \$html or die "cannot capture stdout: $!";
  my $ok = eval { do $officium; 1 };
  if (!$ok) {
    my $err = $@ || $! || 'unknown error';
    die $err unless $err =~ /__EXIT__/;
  }
}

my @commemoentries = @main::commemoentries;
my @dayname = @main::dayname;
my $matins_lessons;
if ($hour eq 'Matutinum') {
  my %seen = ();
  while ($html =~ /Lectio\s+([0-9]{1,2})/g) {
    $seen{$1} = 1;
  }
  $matins_lessons = scalar(keys %seen);
}

my $payload = {
  winner => $main::winner,
  commemoratio => $main::commemoratio,
  commemoentries => \@commemoentries,
  dayname => \@dayname,
  rank => $main::rank,
  vespera => $main::vespera,
  cvespera => $main::cvespera,
  tvesp => $main::tvesp,
  svesp => $main::svesp,
  date1 => $main::date1,
  hour => $hour,
  version => $main::version,
  matinsLessons => $matins_lessons,
};

print JSON::PP->new->canonical->encode($payload), "\n";
