resource "aws_instance" "ml_worker" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "p3.2xlarge"
  count         = 2

  root_block_device {
    encrypted   = true
    volume_type = "gp3"
    volume_size = 100
  }
}

resource "aws_instance" "unknown_gpu" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "g5g.16xlarge"

  root_block_device {
    encrypted   = true
    volume_type = "gp3"
    volume_size = 50
  }
}
